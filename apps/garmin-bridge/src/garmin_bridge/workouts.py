"""Request models for a structured run and their translation to Garmin's workout JSON."""

import datetime as dt
from typing import Annotated, Any, Literal

from garminconnect.workout import (
    ConditionType,
    ExecutableStep,
    RepeatGroup,
    RunningWorkout,
    StepType,
    TargetType,
    WorkoutSegment,
)
from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class PaceRange(CamelModel):
    """Speeds in m/s: Garmin wants the slow end as the lower bound."""

    slow_mps: float = Field(gt=0)
    fast_mps: float = Field(gt=0)

    @model_validator(mode="after")
    def _ordered(self) -> "PaceRange":
        if self.slow_mps > self.fast_mps:
            raise ValueError("slowMps doit être inférieure ou égale à fastMps")
        return self


class Step(CamelModel):
    kind: Literal["warmup", "interval", "recovery", "cooldown"]
    duration_s: float | None = Field(default=None, gt=0)
    distance_m: float | None = Field(default=None, gt=0)
    pace: PaceRange | None = None

    @model_validator(mode="after")
    def _one_end_condition(self) -> "Step":
        if (self.duration_s is None) == (self.distance_m is None):
            raise ValueError("Une étape se termine soit au temps, soit à la distance")
        return self


class Repeat(CamelModel):
    kind: Literal["repeat"]
    iterations: int = Field(ge=1, le=99)
    steps: list[Step] = Field(min_length=1)


class WorkoutRequest(CamelModel):
    name: str = Field(min_length=1, max_length=80)
    date: dt.date
    description: str | None = Field(default=None, max_length=500)
    steps: list[Annotated[Step | Repeat, Field(discriminator="kind")]] = Field(min_length=1)


_STEP_TYPES = {
    "warmup": StepType.WARMUP,
    "interval": StepType.INTERVAL,
    "recovery": StepType.RECOVERY,
    "cooldown": StepType.COOLDOWN,
}
_RUNNING = {"sportTypeId": 1, "sportTypeKey": "running", "displayOrder": 1}


def _executable(step: Step, order: int) -> ExecutableStep:
    if step.duration_s is not None:
        end = {"conditionTypeId": ConditionType.TIME, "conditionTypeKey": "time", "displayOrder": 2}
        value = step.duration_s
    else:
        end = {"conditionTypeId": ConditionType.DISTANCE, "conditionTypeKey": "distance", "displayOrder": 3}
        value = step.distance_m
    target: dict[str, Any] = {"workoutTargetTypeId": TargetType.NO_TARGET, "workoutTargetTypeKey": "no.target"}
    if step.pace:
        target = {"workoutTargetTypeId": TargetType.PACE_ZONE, "workoutTargetTypeKey": "pace.zone"}
    return ExecutableStep(
        stepOrder=order,
        stepType={
            "stepTypeId": _STEP_TYPES[step.kind],
            "stepTypeKey": step.kind,
            "displayOrder": _STEP_TYPES[step.kind],
        },
        endCondition={**end, "displayable": True},
        endConditionValue=value,
        targetType={**target, "displayOrder": 1},
        targetValueOne=step.pace.slow_mps if step.pace else None,
        targetValueTwo=step.pace.fast_mps if step.pace else None,
    )


def _estimated_seconds(step: Step) -> float:
    if step.duration_s is not None:
        return step.duration_s
    # Distance steps without a pace are left out of the estimate: Garmin only displays it.
    return step.distance_m / ((step.pace.slow_mps + step.pace.fast_mps) / 2) if step.pace and step.distance_m else 0


def build_workout(request: WorkoutRequest) -> dict[str, Any]:
    """stepOrder is unique across the whole workout, nested steps included, as Garmin expects."""
    order = 0
    steps: list[ExecutableStep | RepeatGroup] = []
    seconds = 0.0
    for item in request.steps:
        order += 1
        if isinstance(item, Step):
            steps.append(_executable(item, order))
            seconds += _estimated_seconds(item)
            continue
        group_order = order
        children = []
        for child in item.steps:
            order += 1
            children.append(_executable(child, order))
        steps.append(
            RepeatGroup(
                stepOrder=group_order,
                stepType={"stepTypeId": StepType.REPEAT, "stepTypeKey": "repeat", "displayOrder": StepType.REPEAT},
                numberOfIterations=item.iterations,
                workoutSteps=children,
                endCondition={
                    "conditionTypeId": ConditionType.ITERATIONS,
                    "conditionTypeKey": "iterations",
                    "displayOrder": 7,
                    "displayable": False,
                },
                endConditionValue=float(item.iterations),
            )
        )
        seconds += item.iterations * sum(_estimated_seconds(child) for child in item.steps)
    workout = RunningWorkout(
        workoutName=request.name,
        description=request.description,
        estimatedDurationInSecs=round(seconds),
        workoutSegments=[WorkoutSegment(segmentOrder=1, sportType=_RUNNING, workoutSteps=steps)],
    )
    return workout.to_dict()

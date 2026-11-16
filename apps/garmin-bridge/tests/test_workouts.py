import pytest
from pydantic import ValidationError

from garmin_bridge.workouts import WorkoutRequest, build_workout


def pace(minutes: int, seconds: int) -> float:
    return 1000 / (minutes * 60 + seconds)


def band(minutes: int, seconds: int) -> dict[str, float]:
    """±5 s/km around the target pace."""
    total = minutes * 60 + seconds
    return {"slowMps": 1000 / (total + 5), "fastMps": 1000 / (total - 5)}


INTERVALS = WorkoutRequest.model_validate(
    {
        "name": "Fractionné 6 x 800 m",
        "date": "2026-11-18",
        "steps": [
            {"kind": "warmup", "durationS": 900, "pace": band(6, 20)},
            {
                "kind": "repeat",
                "iterations": 6,
                "steps": [
                    {"kind": "interval", "distanceM": 800, "pace": band(4, 55)},
                    {"kind": "recovery", "durationS": 120},
                ],
            },
            {"kind": "cooldown", "durationS": 600, "pace": band(6, 30)},
        ],
    }
)


def test_intervals_session_matches_garmin_format():
    workout = build_workout(INTERVALS)
    assert workout["workoutName"] == "Fractionné 6 x 800 m"
    assert workout["sportType"]["sportTypeKey"] == "running"
    warmup, repeat, cooldown = workout["workoutSegments"][0]["workoutSteps"]

    assert warmup["type"] == "ExecutableStepDTO"
    assert warmup["stepType"]["stepTypeKey"] == "warmup"
    assert warmup["endCondition"]["conditionTypeId"] == 2
    assert warmup["endConditionValue"] == 900
    assert warmup["targetType"]["workoutTargetTypeId"] == 6
    assert warmup["targetValueOne"] < pace(6, 20) < warmup["targetValueTwo"]

    assert repeat["type"] == "RepeatGroupDTO"
    assert repeat["numberOfIterations"] == 6
    assert repeat["endCondition"]["conditionTypeKey"] == "iterations"
    interval, recovery = repeat["workoutSteps"]
    assert interval["endCondition"] == {
        "conditionTypeId": 3,
        "conditionTypeKey": "distance",
        "displayOrder": 3,
        "displayable": True,
    }
    assert interval["endConditionValue"] == 800
    assert interval["targetValueOne"] < pace(4, 55) < interval["targetValueTwo"]
    assert recovery["stepType"]["stepTypeId"] == 4
    assert recovery["targetType"]["workoutTargetTypeKey"] == "no.target"
    assert "targetValueOne" not in recovery

    assert cooldown["stepType"]["stepTypeKey"] == "cooldown"
    assert [warmup["stepOrder"], repeat["stepOrder"], interval["stepOrder"], recovery["stepOrder"]] == [1, 2, 3, 4]
    assert cooldown["stepOrder"] == 5


def test_estimated_duration_counts_every_repeat():
    # 15 min + 6 x (800 m at about 4:55/km + 2 min) + 10 min, about 60.5 min.
    seconds = build_workout(INTERVALS)["estimatedDurationInSecs"]
    assert 3600 < seconds < 3670


@pytest.mark.parametrize(
    "step",
    [
        {"kind": "interval"},
        {"kind": "interval", "durationS": 60, "distanceM": 200},
        {"kind": "interval", "durationS": 60, "pace": {"slowMps": 4, "fastMps": 3}},
        {"kind": "sprint", "durationS": 60},
    ],
)
def test_invalid_steps_are_rejected(step):
    with pytest.raises(ValidationError):
        WorkoutRequest.model_validate({"name": "x", "date": "2026-11-18", "steps": [step]})

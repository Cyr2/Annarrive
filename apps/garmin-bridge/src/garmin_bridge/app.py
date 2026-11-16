"""Internal HTTP service: the only place that talks to Garmin Connect.

No training logic lives here. The Talaria server asks, this service fetches or sends.
"""

import datetime as dt
import hmac
import os
from typing import Annotated, Any

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse
from garminconnect import (
    Garmin,
    GarminConnectAuthenticationError,
    GarminConnectConnectionError,
    GarminConnectNotFoundError,
    GarminConnectTooManyRequestsError,
)

from garmin_bridge.session import forget_session, get_garmin
from garmin_bridge.workouts import CamelModel, WorkoutRequest, build_workout

# shortcut: the library does not expose Garmin's Retry-After, so we ask for a fixed pause; read it if it ever does.
RETRY_AFTER_SECONDS = 300


def require_secret(x_bridge_secret: str = Header(default="")) -> None:
    expected = os.environ.get("BRIDGE_SECRET", "")
    # An unset secret must never let a request through.
    if not expected or not hmac.compare_digest(x_bridge_secret, expected):
        raise HTTPException(status_code=401, detail="Secret invalide")


app = FastAPI(title="garmin-bridge", docs_url=None, redoc_url=None)
GarminDep = Annotated[Garmin, Depends(get_garmin)]
protected = [Depends(require_secret)]


@app.exception_handler(GarminConnectAuthenticationError)
def _auth_error(_: Request, __: Exception) -> JSONResponse:
    forget_session()
    return JSONResponse(
        {"code": "garmin_auth", "detail": "Connexion Garmin refusée : lancer garmin-bridge-login"}, status_code=401
    )


@app.exception_handler(GarminConnectTooManyRequestsError)
def _rate_limited(_: Request, __: Exception) -> JSONResponse:
    return JSONResponse(
        {"code": "rate_limited", "detail": "Garmin limite les requêtes"},
        status_code=429,
        headers={"Retry-After": str(RETRY_AFTER_SECONDS)},
    )


@app.exception_handler(GarminConnectConnectionError)
def _upstream_error(_: Request, __: Exception) -> JSONResponse:
    return JSONResponse({"code": "upstream", "detail": "Garmin Connect ne répond pas correctement"}, status_code=502)


class Activity(CamelModel):
    id: int
    type: str | None
    start_time_local: str | None
    start_time_gmt: str | None
    duration_s: float | None
    distance_m: float | None
    avg_speed_mps: float | None
    avg_pace_s_per_km: float | None
    avg_hr: float | None
    max_hr: float | None
    elevation_gain_m: float | None
    feel: float | None
    rpe: float | None


class Lap(CamelModel):
    duration_s: float | None
    distance_m: float | None
    avg_speed_mps: float | None
    avg_hr: float | None


class DailySignals(CamelModel):
    date: dt.date
    sleep_s: int | None
    sleep_score: int | None
    resting_hr: int | None
    stress_avg: int | None
    body_battery_at_wake: int | None
    body_battery_highest: int | None
    vo2_max: float | None


class CreatedWorkout(CamelModel):
    workout_id: int


def _to_activity(raw: dict[str, Any]) -> Activity:
    speed = raw.get("averageSpeed")
    return Activity(
        id=raw["activityId"],
        type=(raw.get("activityType") or {}).get("typeKey"),
        start_time_local=raw.get("startTimeLocal"),
        start_time_gmt=raw.get("startTimeGMT"),
        duration_s=raw.get("duration"),
        distance_m=raw.get("distance"),
        avg_speed_mps=speed,
        avg_pace_s_per_km=1000 / speed if speed else None,
        avg_hr=raw.get("averageHR"),
        max_hr=raw.get("maxHR"),
        elevation_gain_m=raw.get("elevationGain"),
        # Self-evaluation fields, absent when the watch does not ask (likely on vivoactive 4).
        feel=raw.get("directWorkoutFeel"),
        rpe=raw.get("directWorkoutRpe"),
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/whoami", dependencies=protected)
def whoami() -> dict[str, bool]:
    return {"authorized": True}


@app.get("/activities", dependencies=protected)
def recent_activities(garmin: GarminDep, limit: Annotated[int, Query(ge=1, le=100)] = 20) -> list[Activity]:
    return [_to_activity(raw) for raw in garmin.get_activities(0, limit)]


@app.get("/activities/{activity_id}/laps", dependencies=protected)
def activity_laps(garmin: GarminDep, activity_id: int) -> list[Lap]:
    laps = garmin.get_activity_splits(str(activity_id)).get("lapDTOs") or []
    return [
        Lap(
            duration_s=lap.get("duration"),
            distance_m=lap.get("distance"),
            avg_speed_mps=lap.get("averageSpeed"),
            avg_hr=lap.get("averageHR"),
        )
        for lap in laps
    ]


def _vo2max(raw: Any) -> float | None:
    generic = (raw[0].get("generic") or {}) if isinstance(raw, list) and raw else {}
    return generic.get("vo2MaxPreciseValue") or generic.get("vo2MaxValue")


@app.get("/daily/{day}", dependencies=protected)
def daily_signals(garmin: GarminDep, day: dt.date) -> DailySignals:
    iso = day.isoformat()
    summary = garmin.get_user_summary(iso)
    sleep = (garmin.get_sleep_data(iso) or {}).get("dailySleepDTO") or {}
    score = ((sleep.get("sleepScores") or {}).get("overall") or {}).get("value")
    return DailySignals(
        date=day,
        sleep_s=sleep.get("sleepTimeSeconds"),
        sleep_score=score,
        resting_hr=summary.get("restingHeartRate"),
        stress_avg=summary.get("averageStressLevel"),
        body_battery_at_wake=summary.get("bodyBatteryAtWakeTime"),
        body_battery_highest=summary.get("bodyBatteryHighestValue"),
        vo2_max=_vo2max(garmin.get_max_metrics(iso)),
    )


@app.post("/workouts", dependencies=protected, status_code=201)
def create_workout(garmin: GarminDep, request: WorkoutRequest) -> CreatedWorkout:
    workout_id = int(garmin.upload_workout(build_workout(request))["workoutId"])
    try:
        garmin.schedule_workout(workout_id, request.date.isoformat())
    except Exception:
        # An unscheduled template would pile up in Anna's library on every retry.
        garmin.delete_workout(workout_id)
        raise
    return CreatedWorkout(workout_id=workout_id)


@app.delete("/workouts/{workout_id}", dependencies=protected, status_code=204)
def delete_workout(garmin: GarminDep, workout_id: int) -> Response:
    # Each Talaria workout is a one-off template; deleting it also removes it from the calendar.
    try:
        garmin.delete_workout(workout_id)
    except GarminConnectNotFoundError:
        pass  # Already gone: the goal of the call is reached.
    return Response(status_code=204)

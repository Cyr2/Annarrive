"""Internal HTTP service: the only place that talks to Garmin Connect.

No training logic lives here. The Annarrivé server asks, this service fetches or sends.
Reads go through Garmin's official Personal API when GARMIN_API_KEY is set, and fall back field by field
to the unofficial login (python-garminconnect). Writes always use the unofficial login: the official API is read only.
"""

import datetime as dt
import hmac
import logging
import os
from collections.abc import Callable
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

from garmin_bridge.official import OfficialApi, get_official
from garmin_bridge.session import forget_session, get_garmin
from garmin_bridge.workouts import CamelModel, WorkoutRequest, build_workout

log = logging.getLogger(__name__)

# shortcut: the library does not expose Garmin's Retry-After, so we ask for a fixed pause; read it if it ever does.
RETRY_AFTER_SECONDS = 300


def require_secret(x_bridge_secret: str = Header(default="")) -> None:
    expected = os.environ.get("BRIDGE_SECRET", "")
    # An unset secret must never let a request through.
    if not expected or not hmac.compare_digest(x_bridge_secret, expected):
        raise HTTPException(status_code=401, detail="Secret invalide")


app = FastAPI(title="garmin-bridge", docs_url=None, redoc_url=None)
GarminDep = Annotated[Garmin, Depends(get_garmin)]
OfficialDep = Annotated[OfficialApi | None, Depends(get_official)]


def unofficial() -> Callable[[], Garmin]:
    """Reads log in to the unofficial session only when the official API left a value missing."""
    return get_garmin


LazyGarminDep = Annotated[Callable[[], Garmin], Depends(unofficial)]
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


def _with_fallback(
    primary: list[dict[str, Any]] | None, fallback: Callable[[], list[dict[str, Any]]], key: str
) -> list[dict[str, Any]]:
    """Official rows first; each missing value is taken from the unofficial rows with the same key."""
    if primary is not None and all(None not in row.values() for row in primary):
        return primary
    try:
        backup = fallback()
    except (GarminConnectAuthenticationError, GarminConnectConnectionError, GarminConnectTooManyRequestsError) as error:
        if primary is None:
            raise
        if isinstance(error, GarminConnectAuthenticationError):
            forget_session()
        # Partial official data beats an error: the server already handles missing values.
        log.warning("Complément non officiel impossible (%s), données officielles partielles", type(error).__name__)
        return primary
    if primary is None:
        return backup
    by_key = {row[key]: row for row in backup}
    return [{k: v if v is not None else by_key.get(row[key], {}).get(k) for k, v in row.items()} for row in primary]


@app.get("/activities", dependencies=protected)
def recent_activities(
    official: OfficialDep, garmin: LazyGarminDep, limit: Annotated[int, Query(ge=1, le=100)] = 20
) -> list[Activity]:
    raw = (
        official.get("/activitylist-service/activities/search/activities", {"start": 0, "limit": limit})
        if official
        else None
    )
    primary = [_to_activity(a).model_dump() for a in raw] if isinstance(raw, list) else None
    rows = _with_fallback(
        primary, lambda: [_to_activity(a).model_dump() for a in garmin().get_activities(0, limit)], "id"
    )
    return [Activity(**row) for row in rows]


# The Personal API has no lap endpoint (only splitSummaries per activity type): laps stay on the unofficial login.
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


def _daily(day: dt.date, summary: Any, sleep: Any, maxmet: Any) -> dict[str, Any]:
    summary = summary if isinstance(summary, dict) else {}
    sleep = sleep if isinstance(sleep, dict) else {}
    score = ((sleep.get("sleepScores") or {}).get("overall") or {}).get("value")
    return DailySignals(
        date=day,
        sleep_s=sleep.get("sleepTimeSeconds"),
        sleep_score=score,
        resting_hr=summary.get("restingHeartRate"),
        stress_avg=summary.get("averageStressLevel"),
        body_battery_at_wake=summary.get("bodyBatteryAtWakeTime"),
        body_battery_highest=summary.get("bodyBatteryHighestValue"),
        vo2_max=_vo2max(maxmet),
    ).model_dump()


def _daily_official(official: OfficialApi, day: dt.date) -> dict[str, Any] | None:
    iso = day.isoformat()
    parts = (
        official.get("/usersummary-service/usersummary/daily", {"calendarDate": iso}),
        # The official sleep endpoint returns the DailySleepDTO itself, not wrapped like the unofficial one.
        official.get("/sleep-service/sleep/dailySleep", {"date": iso}),
        # Not in the Swagger, but called by Garmin's own Personal API client (get_daily_vo2_max).
        official.get(f"/metrics-service/metrics/maxmet/daily/{iso}/{iso}"),
    )
    return None if all(part is None for part in parts) else _daily(day, *parts)


def _daily_unofficial(garmin: Garmin, day: dt.date) -> dict[str, Any]:
    iso = day.isoformat()
    sleep = (garmin.get_sleep_data(iso) or {}).get("dailySleepDTO")
    return _daily(day, garmin.get_user_summary(iso), sleep, garmin.get_max_metrics(iso))


@app.get("/daily/{day}", dependencies=protected)
def daily_signals(official: OfficialDep, garmin: LazyGarminDep, day: dt.date) -> DailySignals:
    primary = _daily_official(official, day) if official else None
    (row,) = _with_fallback(None if primary is None else [primary], lambda: [_daily_unofficial(garmin(), day)], "date")
    return DailySignals(**row)


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


@app.get("/workouts", dependencies=protected)
def list_workouts(garmin: GarminDep, name_prefix: str = "") -> list[dict[str, Any]]:
    """Read only. The prefix lets a caller list just its own workouts, never the rest of the library."""
    rows = garmin.get_workouts(0, 100) or []
    return [
        {"workoutId": int(w["workoutId"]), "name": w.get("workoutName") or ""}
        for w in rows
        if (w.get("workoutName") or "").startswith(name_prefix)
    ]


@app.delete("/workouts/{workout_id}", dependencies=protected, status_code=204)
def delete_workout(garmin: GarminDep, workout_id: int) -> Response:
    # Each Annarrivé workout is a one-off template; deleting it also removes it from the calendar.
    try:
        garmin.delete_workout(workout_id)
    except GarminConnectNotFoundError:
        pass  # Already gone: the goal of the call is reached.
    return Response(status_code=204)

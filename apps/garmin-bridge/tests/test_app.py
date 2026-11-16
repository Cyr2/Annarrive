from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from garminconnect import (
    GarminConnectAuthenticationError,
    GarminConnectConnectionError,
    GarminConnectNotFoundError,
    GarminConnectTooManyRequestsError,
)

from garmin_bridge import session
from garmin_bridge.app import app
from garmin_bridge.session import get_garmin

client = TestClient(app)
AUTH = {"x-bridge-secret": "s3cret"}


@pytest.fixture
def garmin(monkeypatch):
    monkeypatch.setenv("BRIDGE_SECRET", "s3cret")
    fake = MagicMock()
    app.dependency_overrides[get_garmin] = lambda: fake
    yield fake
    app.dependency_overrides.clear()


def test_health_is_public():
    assert client.get("/health").json() == {"status": "ok"}


def test_protected_route_needs_the_shared_secret(monkeypatch):
    monkeypatch.setenv("BRIDGE_SECRET", "s3cret")
    assert client.get("/whoami").status_code == 401
    assert client.get("/whoami", headers={"x-bridge-secret": "wrong"}).status_code == 401
    assert client.get("/whoami", headers=AUTH).json() == {"authorized": True}


def test_unset_secret_never_authorizes(monkeypatch):
    monkeypatch.delenv("BRIDGE_SECRET", raising=False)
    assert client.get("/whoami", headers={"x-bridge-secret": ""}).status_code == 401


def test_garmin_routes_need_the_secret_too(garmin):
    assert client.get("/activities").status_code == 401
    assert client.post("/workouts", json={}).status_code == 401
    garmin.get_activities.assert_not_called()


def test_recent_activities_are_flattened(garmin):
    garmin.get_activities.return_value = [
        {
            "activityId": 42,
            "activityType": {"typeKey": "running"},
            "startTimeLocal": "2026-11-15 07:30:00",
            "startTimeGMT": "2026-11-15 06:30:00",
            "duration": 1800.0,
            "distance": 5000.0,
            "averageSpeed": 2.5,
            "averageHR": 150.0,
            "maxHR": 172.0,
            "elevationGain": 12.0,
            "directWorkoutFeel": 50,
        },
        {"activityId": 43},
    ]
    response = client.get("/activities?limit=5", headers=AUTH)
    assert response.status_code == 200
    garmin.get_activities.assert_called_once_with(0, 5)
    first, second = response.json()
    assert first["id"] == 42
    assert first["type"] == "running"
    assert first["avgPaceSPerKm"] == 400
    assert first["feel"] == 50
    assert first["rpe"] is None
    assert second["avgPaceSPerKm"] is None


def test_activity_limit_is_bounded(garmin):
    assert client.get("/activities?limit=0", headers=AUTH).status_code == 422


def test_laps(garmin):
    garmin.get_activity_splits.return_value = {"lapDTOs": [{"duration": 200.0, "distance": 800.0}]}
    response = client.get("/activities/42/laps", headers=AUTH)
    garmin.get_activity_splits.assert_called_once_with("42")
    assert response.json() == [{"durationS": 200.0, "distanceM": 800.0, "avgSpeedMps": None, "avgHr": None}]


def test_daily_signals_with_everything(garmin):
    garmin.get_user_summary.return_value = {
        "restingHeartRate": 52,
        "averageStressLevel": 31,
        "bodyBatteryAtWakeTime": 78,
        "bodyBatteryHighestValue": 80,
    }
    garmin.get_sleep_data.return_value = {
        "dailySleepDTO": {"sleepTimeSeconds": 27000, "sleepScores": {"overall": {"value": 82}}}
    }
    garmin.get_max_metrics.return_value = [{"generic": {"vo2MaxPreciseValue": 44.6, "vo2MaxValue": 45}}]
    body = client.get("/daily/2026-11-16", headers=AUTH).json()
    assert body == {
        "date": "2026-11-16",
        "sleepS": 27000,
        "sleepScore": 82,
        "restingHr": 52,
        "stressAvg": 31,
        "bodyBatteryAtWake": 78,
        "bodyBatteryHighest": 80,
        "vo2Max": 44.6,
    }


def test_daily_signals_tolerate_missing_data(garmin):
    garmin.get_user_summary.return_value = {}
    garmin.get_sleep_data.return_value = None
    garmin.get_max_metrics.return_value = []
    body = client.get("/daily/2026-11-16", headers=AUTH).json()
    assert body["sleepS"] is None
    assert body["vo2Max"] is None


def test_daily_rejects_a_bad_date(garmin):
    assert client.get("/daily/hier", headers=AUTH).status_code == 422


WORKOUT = {
    "name": "Fractionné 6 x 800 m",
    "date": "2026-11-18",
    "steps": [{"kind": "warmup", "durationS": 900}, {"kind": "cooldown", "durationS": 600}],
}


def test_create_workout_uploads_then_schedules(garmin):
    garmin.upload_workout.return_value = {"workoutId": 987}
    response = client.post("/workouts", json=WORKOUT, headers=AUTH)
    assert response.status_code == 201
    assert response.json() == {"workoutId": 987}
    assert garmin.upload_workout.call_args.args[0]["workoutName"] == "Fractionné 6 x 800 m"
    garmin.schedule_workout.assert_called_once_with(987, "2026-11-18")


def test_failed_schedule_removes_the_orphan_template(garmin):
    garmin.upload_workout.return_value = {"workoutId": 987}
    garmin.schedule_workout.side_effect = GarminConnectConnectionError("boom")
    assert client.post("/workouts", json=WORKOUT, headers=AUTH).status_code == 502
    garmin.delete_workout.assert_called_once_with(987)


def test_create_workout_validates_the_body(garmin):
    bad = {**WORKOUT, "steps": [{"kind": "warmup", "durationS": 60, "distanceM": 200}]}
    assert client.post("/workouts", json=bad, headers=AUTH).status_code == 422
    garmin.upload_workout.assert_not_called()


def test_delete_workout(garmin):
    assert client.delete("/workouts/987", headers=AUTH).status_code == 204
    garmin.delete_workout.assert_called_once_with(987)


def test_delete_is_idempotent(garmin):
    garmin.delete_workout.side_effect = GarminConnectNotFoundError("gone")
    assert client.delete("/workouts/987", headers=AUTH).status_code == 204


def test_auth_error_is_401_and_drops_the_session(garmin, monkeypatch):
    forgotten = MagicMock()
    monkeypatch.setattr("garmin_bridge.app.forget_session", forgotten)
    garmin.get_activities.side_effect = GarminConnectAuthenticationError("MFA Required")
    response = client.get("/activities", headers=AUTH)
    assert response.status_code == 401
    assert response.json()["code"] == "garmin_auth"
    forgotten.assert_called_once()


def test_rate_limit_is_429_with_retry_after(garmin):
    garmin.get_activities.side_effect = GarminConnectTooManyRequestsError("slow down")
    response = client.get("/activities", headers=AUTH)
    assert response.status_code == 429
    assert response.headers["retry-after"] == "300"


def test_upstream_failure_is_502(garmin):
    garmin.get_user_summary.side_effect = GarminConnectConnectionError("down")
    response = client.get("/daily/2026-11-16", headers=AUTH)
    assert response.status_code == 502
    assert response.json()["code"] == "upstream"


def test_session_logs_in_once_and_resets(monkeypatch):
    fake = MagicMock()
    monkeypatch.setattr(session, "Garmin", MagicMock(return_value=fake))
    session.forget_session()
    assert session.get_garmin() is fake
    assert session.get_garmin() is fake
    fake.login.assert_called_once_with()
    session.forget_session()
    assert session._client is None


def test_login_cli_needs_a_token_dir(monkeypatch):
    monkeypatch.delenv("GARMINTOKENS", raising=False)
    with pytest.raises(SystemExit):
        session.login_cli()


def test_login_cli_reports_refusal(monkeypatch):
    monkeypatch.setenv("GARMINTOKENS", "/tmp/tokens")
    fake = MagicMock()
    fake.login.side_effect = GarminConnectAuthenticationError("bad code")
    monkeypatch.setattr(session, "Garmin", MagicMock(return_value=fake))
    with pytest.raises(SystemExit, match="Connexion refusée"):
        session.login_cli()

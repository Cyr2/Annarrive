import logging
from unittest.mock import MagicMock

import httpx
import pytest
from fastapi.testclient import TestClient
from garminconnect import GarminConnectConnectionError

from garmin_bridge import official as official_module
from garmin_bridge.app import app, unofficial
from garmin_bridge.official import TOKEN_PATH, OfficialApi, get_official

client = TestClient(app)
AUTH = {"x-bridge-secret": "s3cret"}
KEY = "cle-secrete-anna"
DAY = "2026-11-16"

SUMMARY = {"restingHeartRate": 52, "averageStressLevel": 31, "bodyBatteryAtWakeTime": 78, "bodyBatteryHighestValue": 80}
SLEEP = {"sleepTimeSeconds": 27000, "sleepScores": {"overall": {"value": 82}}}
MAXMET = [{"generic": {"vo2MaxPreciseValue": 44.6}}]
ACTIVITY = {
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
    "directWorkoutRpe": 30,
    "eventType": {"typeKey": "race"},
}


class FakeGarmin:
    """Official API double: path -> response, with every request recorded."""

    def __init__(self, routes):
        self.routes = {TOKEN_PATH: httpx.Response(200, text="jwt-token"), **routes}
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return self.routes.get(request.url.path, httpx.Response(404))

    def paths(self):
        return [r.url.path for r in self.requests]


@pytest.fixture
def setup(monkeypatch):
    monkeypatch.setenv("BRIDGE_SECRET", "s3cret")
    fake = MagicMock()
    app.dependency_overrides[unofficial] = lambda: lambda: fake

    def install(routes):
        garmin = FakeGarmin(routes)
        api = OfficialApi(KEY, transport=httpx.MockTransport(garmin))
        app.dependency_overrides[get_official] = lambda: api
        return garmin, fake

    yield install
    app.dependency_overrides.clear()


def daily_routes(**overrides):
    routes = {
        "/usersummary-service/usersummary/daily": httpx.Response(200, json=SUMMARY),
        "/sleep-service/sleep/dailySleep": httpx.Response(200, json=SLEEP),
        f"/metrics-service/metrics/maxmet/daily/{DAY}/{DAY}": httpx.Response(200, json=MAXMET),
    }
    return {**routes, **overrides}


def test_daily_comes_from_the_official_api_alone(setup):
    garmin, fake = setup(daily_routes())
    body = client.get(f"/daily/{DAY}", headers=AUTH).json()
    assert body == {
        "date": DAY,
        "sleepS": 27000,
        "sleepScore": 82,
        "restingHr": 52,
        "stressAvg": 31,
        "bodyBatteryAtWake": 78,
        "bodyBatteryHighest": 80,
        "vo2Max": 44.6,
    }
    token_call, data_call = garmin.requests[0], garmin.requests[1]
    assert token_call.headers["authorization"] == f"ApiKey {KEY}"
    assert data_call.headers["authorization"] == "Bearer jwt-token"
    assert data_call.url.params["calendarDate"] == DAY
    assert garmin.paths().count(TOKEN_PATH) == 1  # token reused across calls
    fake.get_user_summary.assert_not_called()
    fake.get_max_metrics.assert_not_called()


def test_activities_come_from_the_official_api_alone(setup):
    garmin, fake = setup({"/activitylist-service/activities/search/activities": httpx.Response(200, json=[ACTIVITY])})
    (activity,) = client.get("/activities?limit=5", headers=AUTH).json()
    assert activity["id"] == 42 and activity["avgPaceSPerKm"] == 400 and activity["rpe"] == 30
    assert garmin.requests[-1].url.params["limit"] == "5"
    assert garmin.requests[-1].url.params["start"] == "0"
    assert activity["eventType"] == "race"
    fake.get_activities.assert_not_called()


def test_missing_daily_value_is_completed_by_the_unofficial_login(setup):
    # vivoactive 4 case: no VO2max from the official API.
    _, fake = setup(daily_routes(**{f"/metrics-service/metrics/maxmet/daily/{DAY}/{DAY}": httpx.Response(204)}))
    fake.get_user_summary.return_value = {"restingHeartRate": 99}
    fake.get_sleep_data.return_value = None
    fake.get_max_metrics.return_value = [{"generic": {"vo2MaxValue": 45}}]
    body = client.get(f"/daily/{DAY}", headers=AUTH).json()
    assert body["vo2Max"] == 45
    assert body["restingHr"] == 52  # official value wins over the fallback
    assert body["sleepS"] == 27000


def test_missing_activity_value_is_completed_by_id(setup):
    partial = {k: v for k, v in ACTIVITY.items() if k != "averageHR"}
    _, fake = setup({"/activitylist-service/activities/search/activities": httpx.Response(200, json=[partial])})
    fake.get_activities.return_value = [{"activityId": 7, "averageHR": 1.0}, {**ACTIVITY, "averageHR": 149.0}]
    (activity,) = client.get("/activities", headers=AUTH).json()
    assert activity["avgHr"] == 149.0
    assert activity["maxHr"] == 172.0


def test_failed_fallback_keeps_the_partial_official_data(setup):
    _, fake = setup(daily_routes(**{f"/metrics-service/metrics/maxmet/daily/{DAY}/{DAY}": httpx.Response(204)}))
    fake.get_user_summary.side_effect = GarminConnectConnectionError("down")
    response = client.get(f"/daily/{DAY}", headers=AUTH)
    assert response.status_code == 200
    assert response.json()["restingHr"] == 52 and response.json()["vo2Max"] is None


def test_refused_key_falls_back_without_logging_the_key(setup, caplog):
    garmin, fake = setup({TOKEN_PATH: httpx.Response(401, text="invalid")})
    fake.get_user_summary.return_value = SUMMARY
    fake.get_sleep_data.return_value = {"dailySleepDTO": SLEEP}
    fake.get_max_metrics.return_value = MAXMET
    with caplog.at_level(logging.DEBUG):
        body = client.get(f"/daily/{DAY}", headers=AUTH).json()
        client.get(f"/daily/{DAY}", headers=AUTH)
    assert body["restingHr"] == 52 and body["sleepScore"] == 82
    assert "accès refusé (401)" in caplog.text
    assert KEY not in caplog.text
    assert garmin.paths() == [TOKEN_PATH]  # the refused key is not retried on every call


def test_revoked_token_is_dropped_and_fetched_again(setup):
    garmin, fake = setup(
        {"/activitylist-service/activities/search/activities": httpx.Response(403)},
    )
    fake.get_activities.return_value = [ACTIVITY]
    assert client.get("/activities", headers=AUTH).json()[0]["id"] == 42
    client.get("/activities", headers=AUTH)
    assert garmin.paths().count(TOKEN_PATH) == 2


def test_rate_limit_pauses_the_official_api_for_retry_after(setup, monkeypatch):
    now = [1000.0]
    monkeypatch.setattr(official_module.time, "monotonic", lambda: now[0])
    path = "/activitylist-service/activities/search/activities"
    garmin, fake = setup({path: httpx.Response(429, headers={"Retry-After": "120"})})
    fake.get_activities.return_value = [ACTIVITY]
    assert client.get("/activities", headers=AUTH).status_code == 200
    now[0] += 119
    client.get("/activities", headers=AUTH)
    assert garmin.paths().count(path) == 1  # paused: the fallback answered alone
    now[0] += 2
    client.get("/activities", headers=AUTH)
    assert garmin.paths().count(path) == 2


def test_no_key_means_no_official_client(monkeypatch):
    monkeypatch.delenv("GARMIN_API_KEY", raising=False)
    assert get_official() is None
    monkeypatch.setenv("GARMIN_API_KEY", KEY)
    api = get_official()
    assert api is not None and KEY not in repr(api)

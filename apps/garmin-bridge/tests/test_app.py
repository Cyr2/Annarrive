from fastapi.testclient import TestClient

from garmin_bridge.app import app

client = TestClient(app)


def test_health_is_public():
    assert client.get("/health").json() == {"status": "ok"}


def test_protected_route_needs_the_shared_secret(monkeypatch):
    monkeypatch.setenv("BRIDGE_SECRET", "s3cret")
    assert client.get("/whoami").status_code == 401
    assert client.get("/whoami", headers={"x-bridge-secret": "wrong"}).status_code == 401
    assert client.get("/whoami", headers={"x-bridge-secret": "s3cret"}).json() == {"authorized": True}


def test_unset_secret_never_authorizes(monkeypatch):
    monkeypatch.delenv("BRIDGE_SECRET", raising=False)
    assert client.get("/whoami", headers={"x-bridge-secret": ""}).status_code == 401

"""Read client for Garmin's official Personal API (read only, cannot write workouts).

Docs: https://developer.garmin.com/gc-developer-program/personal/personal-api/ (token exchange),
https://developer.garmin.com/gc-developer-program/personal/swagger-docs/ (endpoints),
https://github.com/garmin/connect-personal-api-python (Garmin's reference client).
"""

import logging
import os
import threading
import time
from typing import Any

import httpx

BASE_URL = "https://personal.connectapi.garmin.com"
TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token"
# Tokens live 24 h with no refresh token; renew a bit early.
TOKEN_TTL_SECONDS = 23 * 3600
# shortcut: Garmin documents no rate limit; without Retry-After we pause like the unofficial path does.
DEFAULT_PAUSE_SECONDS = 300
# A refused key will not fix itself between two requests: avoid hammering the token endpoint.
AUTH_PAUSE_SECONDS = 600

log = logging.getLogger(__name__)


class OfficialApi:
    """Every failure returns None so the caller falls back to the unofficial login."""

    def __init__(self, api_key: str, transport: httpx.BaseTransport | None = None) -> None:
        self._key = api_key
        self._http = httpx.Client(base_url=BASE_URL, timeout=30, transport=transport)
        self._lock = threading.Lock()
        self._token: str | None = None
        self._token_until = 0.0
        self._paused_until = 0.0

    def __repr__(self) -> str:
        return "OfficialApi()"  # never print the key

    def _bearer(self) -> str | None:
        with self._lock:
            if self._token and time.monotonic() < self._token_until:
                return self._token
            response = self._http.post(TOKEN_PATH, headers={"Authorization": f"ApiKey {self._key}", "Accept": "*/*"})
            if not self._usable(response, TOKEN_PATH):
                return None
            self._token, self._token_until = response.text.strip(), time.monotonic() + TOKEN_TTL_SECONDS
            return self._token

    def _usable(self, response: httpx.Response, path: str) -> bool:
        if response.is_success:
            return True
        status = response.status_code
        if status in (401, 403):
            self._token = None
            if path == TOKEN_PATH:
                self._paused_until = time.monotonic() + AUTH_PAUSE_SECONDS
            log.warning("API officielle Garmin : accès refusé (%s) sur %s, lecture non officielle", status, path)
        elif status == 429:
            retry_after = response.headers.get("retry-after", "")
            pause = int(retry_after) if retry_after.isdigit() else DEFAULT_PAUSE_SECONDS
            self._paused_until = time.monotonic() + pause
            log.warning("API officielle Garmin : limite atteinte, pause de %s s", pause)
        else:
            log.warning("API officielle Garmin : réponse %s sur %s", status, path)
        return False

    def get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        """Decoded JSON, or None when the value must come from the fallback."""
        if time.monotonic() < self._paused_until:
            return None
        try:
            token = self._bearer()
            if token is None:
                return None
            response = self._http.get(path, params=params, headers={"Authorization": f"Bearer {token}"})
            if not self._usable(response, path) or not response.content:
                return None
            return response.json()
        except (httpx.HTTPError, ValueError) as error:
            log.warning("API officielle Garmin injoignable sur %s : %s", path, type(error).__name__)
            return None


_lock = threading.Lock()
_api: OfficialApi | None = None


def get_official() -> OfficialApi | None:
    """FastAPI dependency: None when GARMIN_API_KEY is unset, so reads use the unofficial login."""
    global _api
    key = os.environ.get("GARMIN_API_KEY", "").strip()
    if not key:
        return None
    with _lock:
        if _api is None or _api._key != key:
            _api = OfficialApi(key)
        return _api

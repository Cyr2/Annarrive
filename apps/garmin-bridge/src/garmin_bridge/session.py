"""One Garmin Connect session per process, resumed from the token store."""

import os
import sys
import threading

from garminconnect import Garmin, GarminConnectAuthenticationError

_lock = threading.Lock()
_client: Garmin | None = None


def _new_client(prompt_mfa=None) -> Garmin:
    return Garmin(os.environ.get("GARMIN_EMAIL"), os.environ.get("GARMIN_PASSWORD"), prompt_mfa=prompt_mfa)


def get_garmin() -> Garmin:
    """FastAPI dependency. login() reads GARMINTOKENS itself and only uses the password if the tokens fail."""
    global _client
    with _lock:
        if _client is None:
            client = _new_client()
            # Without prompt_mfa an MFA challenge raises an auth error: the code must be entered via the CLI.
            client.login()
            _client = client
        return _client


def forget_session() -> None:
    """Called after an auth error so the next request logs in again instead of reusing dead tokens."""
    global _client
    with _lock:
        _client = None


def login_cli() -> None:
    """`uv run garmin-bridge-login`: run once by a human in the container to answer the MFA code."""
    if not os.environ.get("GARMINTOKENS"):
        sys.exit("GARMINTOKENS doit pointer vers le dossier des jetons.")
    client = _new_client(prompt_mfa=lambda: input("Code de vérification Garmin : ").strip())
    try:
        client.login()
    except GarminConnectAuthenticationError as error:
        sys.exit(f"Connexion refusée : {error}")
    print("Connexion Garmin réussie, jetons enregistrés.")

"""Internal HTTP service: the only place that talks to Garmin Connect.

No training logic lives here. The Talaria server asks, this service fetches or sends.
"""

import hmac
import os

from fastapi import Depends, FastAPI, Header, HTTPException


def require_secret(x_bridge_secret: str = Header(default="")) -> None:
    expected = os.environ.get("BRIDGE_SECRET", "")
    # An unset secret must never let a request through.
    if not expected or not hmac.compare_digest(x_bridge_secret, expected):
        raise HTTPException(status_code=401, detail="Secret invalide")


app = FastAPI(title="garmin-bridge", docs_url=None, redoc_url=None)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/whoami", dependencies=[Depends(require_secret)])
def whoami() -> dict[str, bool]:
    return {"authorized": True}

# syntax=docker/dockerfile:1
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN uv sync --frozen --no-dev
# Garmin session tokens live on this volume (valid about six months).
ENV GARMINTOKENS=/data/garmin
RUN mkdir -p /data/garmin && chown -R nobody /data
VOLUME /data
USER nobody
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')"
CMD ["uv", "run", "--no-dev", "uvicorn", "garmin_bridge.app:app", "--host", "0.0.0.0", "--port", "8000"]

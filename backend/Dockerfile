# Build from the REPOSITORY ROOT, because the backend depends on ../Game_Engine:
#   docker build -f backend/Dockerfile -t learning-game-backend .
#
# Single-instance deployment: SQLite and in-process jobs. Mount a durable
# volume at /data and run exactly one container. See backend/README.md.

# ---- build stage: resolve and install locked dependencies with uv ----------
FROM ghcr.io/astral-sh/uv:0.9.16-python3.12-bookworm-slim AS builder
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0
WORKDIR /app

# The engine is a local path dependency (see [tool.uv.sources] in pyproject.toml).
COPY Game_Engine/pyproject.toml Game_Engine/uv.lock Game_Engine/README.md ./Game_Engine/
COPY Game_Engine/src ./Game_Engine/src
COPY backend/pyproject.toml backend/uv.lock backend/README.md ./backend/
COPY backend/src ./backend/src

WORKDIR /app/backend
RUN uv sync --locked --no-dev --no-editable

# ---- runtime stage: no uv, no build tools, non-root user ------------------
FROM python:3.12-slim-bookworm AS runtime
RUN groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid app --home-dir /home/app --create-home app \
 && mkdir /data \
 && chown app:app /data

# Keep the same path as the build stage: the virtualenv's scripts refer to it.
COPY --from=builder --chown=app:app /app/backend/.venv /app/backend/.venv
ENV PATH="/app/backend/.venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    LEARNING_GAME_DATA_DIR=/data

USER app
VOLUME ["/data"]
EXPOSE 8000

# Secrets and settings come from the environment at run time, never from the image.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=2).status == 200 else 1)"]

CMD ["learning-game-api", "serve", "--host", "0.0.0.0", "--port", "8000"]

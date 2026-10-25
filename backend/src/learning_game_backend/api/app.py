"""Builds the FastAPI application: middleware, routers, and startup work.

Routes live in api/routes/. This module wires the service, settings, CORS,
compression, and error handling together. Run the server with
`uv run learning-game-api serve`; interactive docs are at /docs.
"""

import logging
from collections.abc import Awaitable, Callable
from dataclasses import replace

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from learning_game_engine.rules import DEFAULT_RULES, Rules
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware

from learning_game_backend.api.errors import error_body, install_error_handlers
from learning_game_backend.api.routes import (
    auth,
    documents,
    gameplay,
    questions,
    study_packs,
)
from learning_game_backend.api.schemas import ServiceHealth
from learning_game_backend.application.game_service import GameService
from learning_game_backend.config import GameMasterMode, Settings
from learning_game_backend.persistence.migrations import migrate
from learning_game_backend.rag.fake_provider import FakeGameMaster
from learning_game_backend.rag.http_client import HttpGameMaster
from learning_game_backend.rag.protocol import GameMaster

logger = logging.getLogger("learning_game_backend.api")

UPLOAD_PATHS = frozenset({"/api/documents", "/api/study-packs"})
# Room for the multipart boundary and headers around the PDF itself.
MULTIPART_OVERHEAD_BYTES = 64 * 1024


def build_game_master(settings: Settings) -> GameMaster | None:
    """The provider selected by GAME_MASTER_MODE, or None when disabled."""
    if settings.game_master_mode is GameMasterMode.HTTP:
        assert settings.game_master_url is not None
        return HttpGameMaster(
            settings.game_master_url,
            settings.game_master_api_key,
            settings.game_master_timeout_seconds,
        )
    if settings.game_master_mode is GameMasterMode.FAKE:
        logger.warning("GAME_MASTER_MODE=fake: questions are NOT generated from PDFs.")
        return FakeGameMaster()
    return None


def create_app(
    settings: Settings | None = None,
    game_master: GameMaster | None = None,
    rules: Rules = DEFAULT_RULES,
) -> FastAPI:
    """Build the application. Tests pass their own settings and provider."""
    settings = settings or Settings.from_env()
    if game_master is None:
        game_master = build_game_master(settings)
    service = GameService(
        settings,
        game_master,
        replace(
            rules,
            starting_xp=settings.starting_xp,
            battle_cost=settings.battle_cost,
            award_battle_xp=settings.award_battle_xp,
            practice_cost=settings.practice_cost,
            practice_correct_xp=settings.practice_correct_xp,
            battle_wrong_xp=settings.battle_wrong_xp,
        ),
    )

    migrate(settings.database_path)
    recovered = service.recover_interrupted_jobs()
    if recovered:
        logger.warning("Marked %d interrupted job(s) as failed.", recovered)

    app = FastAPI(
        title="Learning Game API",
        version="0.1.0",
        description=(
            "Authenticated API for the learning game. XP and health are "
            "server-authoritative and shared by practice and adventure."
        ),
    )
    app.state.service = service
    app.state.settings = settings
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.cors_origins),
            allow_methods=["GET", "POST"],
            # ngrok-skip-browser-warning lets a browser reach the API through a free
            # ngrok tunnel, which otherwise answers with an HTML warning page.
            allow_headers=[
                "Authorization",
                "Content-Type",
                "Idempotency-Key",
                "ngrok-skip-browser-warning",
            ],
            allow_credentials=False,
        )
    app.add_middleware(GZipMiddleware, minimum_size=settings.gzip_minimum_bytes)
    install_error_handlers(app)

    @app.middleware("http")
    async def no_store(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response = await call_next(request)
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.middleware("http")
    async def limit_upload_size(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        """Refuse oversized uploads from the Content-Length header, before the
        multipart body is received and buffered. The PDF check repeats the
        exact limit on the file itself."""
        if request.method == "POST" and request.url.path in UPLOAD_PATHS:
            length = request.headers.get("content-length")
            if length is None or not length.isdigit():
                return JSONResponse(
                    error_body(
                        "length_required", "Uploads must include a Content-Length."
                    ),
                    status_code=411,
                )
            if int(length) > settings.max_upload_bytes + MULTIPART_OVERHEAD_BYTES:
                return JSONResponse(
                    error_body(
                        "too_large",
                        f"PDFs are limited to {settings.max_upload_bytes} bytes.",
                    ),
                    status_code=413,
                )
        return await call_next(request)

    @app.get("/healthz", response_model=ServiceHealth, tags=["service"])
    def healthz() -> ServiceHealth:
        """Service liveness. Unrelated to player health."""
        return ServiceHealth(
            status="ok",
            game_master=game_master.name if game_master else "disabled",
        )

    for router in (
        auth.router,
        documents.router,
        questions.router,
        gameplay.router,
        study_packs.router,
    ):
        app.include_router(router)
    return app

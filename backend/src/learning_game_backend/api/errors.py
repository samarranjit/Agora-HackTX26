"""One error shape for every failure: {"error": {code, message, details}}."""

import logging
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from learning_game_backend.application.game_service import AppError

logger = logging.getLogger("learning_game_backend.api")


def error_body(code: str, message: str, details: Any = None) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "details": details}}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error(_: Request, exc: AppError) -> JSONResponse:
        headers = {"WWW-Authenticate": "Bearer"} if exc.status == 401 else None
        return JSONResponse(
            error_body(exc.code, exc.message), status_code=exc.status, headers=headers
        )

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {"field": ".".join(str(part) for part in err["loc"]), "problem": err["msg"]}
            for err in exc.errors()
        ]
        return JSONResponse(
            error_body("invalid_request", "The request is not valid.", details),
            status_code=422,
        )

    @app.exception_handler(HTTPException)
    async def http_error(_: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse(
            error_body("http_error", str(exc.detail)), status_code=exc.status_code
        )

    @app.exception_handler(Exception)
    async def unexpected(_: Request, exc: Exception) -> JSONResponse:
        # Log the type only: exception text could echo request data.
        logger.error("Unhandled %s", type(exc).__name__)
        return JSONResponse(
            error_body("internal_error", "Something went wrong."), status_code=500
        )

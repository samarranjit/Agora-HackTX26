"""Shared FastAPI dependencies: the service, settings, and the signed-in player.

Player identity comes only from the bearer token. No route accepts a user ID.
"""

from typing import Annotated, Any

from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from learning_game_backend.api.schemas import ErrorResponse
from learning_game_backend.application.game_service import AppError, GameService
from learning_game_backend.auth import service as accounts
from learning_game_backend.auth.service import Account
from learning_game_backend.config import Settings

bearer_scheme = HTTPBearer(auto_error=False)

IdempotencyKey = Annotated[
    str,
    Header(
        alias="Idempotency-Key",
        min_length=8,
        max_length=128,
        pattern=r"^[A-Za-z0-9_.:-]+$",
        description="A unique value per intended action; reuse it only to retry.",
    ),
]

COMMON_ERRORS: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
}


def get_service(request: Request) -> GameService:
    service: GameService = request.app.state.service
    return service


def get_settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


ServiceDep = Annotated[GameService, Depends(get_service)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
BearerCredentials = Annotated[
    HTTPAuthorizationCredentials | None, Depends(bearer_scheme)
]


def current_account(credentials: BearerCredentials, service: ServiceDep) -> Account:
    if credentials is None:
        raise AppError(401, "not_authenticated", "Sign in to use this endpoint.")
    with service.connection() as conn:
        account = accounts.authenticate(conn, credentials.credentials)
    if account is None:
        raise AppError(401, "invalid_token", "The session is invalid or expired.")
    return account


Authed = Annotated[Account, Depends(current_account)]

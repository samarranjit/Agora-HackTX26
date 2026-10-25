"""Registration, login, and logout."""

from fastapi import APIRouter, Response

from learning_game_backend.api.dependencies import (
    Authed,
    BearerCredentials,
    ServiceDep,
    SettingsDep,
)
from learning_game_backend.api.schemas import (
    AccountResponse,
    ErrorResponse,
    LoginResponse,
)
from learning_game_backend.api.schemas import Credentials as CredentialsBody
from learning_game_backend.application.game_service import AppError
from learning_game_backend.auth import service as accounts
from learning_game_backend.auth.service import AccountError

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=AccountResponse,
    status_code=201,
    responses={403: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def register(
    body: CredentialsBody, service: ServiceDep, settings: SettingsDep
) -> AccountResponse:
    if not settings.allow_registration:
        raise AppError(403, "registration_closed", "Registration is disabled.")
    with service.connection() as conn:
        try:
            account = accounts.register(conn, body.username, body.password)
        except AccountError as exc:
            taken = "already taken" in str(exc)
            raise AppError(
                409 if taken else 422, "registration_failed", str(exc)
            ) from None
        try:
            service.create_player(conn, account)
        except Exception:
            # Never leave an account without game state: undo the registration.
            accounts.delete_account(conn, account.user_id)
            raise
    return AccountResponse(user_id=account.user_id, username=account.username)


@router.post(
    "/login",
    response_model=LoginResponse,
    responses={401: {"model": ErrorResponse}},
)
def login(
    body: CredentialsBody, service: ServiceDep, settings: SettingsDep
) -> LoginResponse:
    with service.connection() as conn:
        try:
            session = accounts.login(
                conn, body.username, body.password, settings.session_ttl_hours
            )
        except AccountError as exc:
            raise AppError(401, "invalid_credentials", str(exc)) from None
    return LoginResponse(access_token=session.token, expires_at=session.expires_at)


@router.post("/logout", status_code=204)
def logout(
    credentials: BearerCredentials, _account: Authed, service: ServiceDep
) -> Response:
    assert credentials is not None
    with service.connection() as conn:
        accounts.logout(conn, credentials.credentials)
    return Response(status_code=204)

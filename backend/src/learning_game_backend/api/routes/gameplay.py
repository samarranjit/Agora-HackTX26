"""Player state, status, practice, battles, and answers."""

from typing import Any

from fastapi import APIRouter, Response

from learning_game_backend.api.dependencies import (
    COMMON_ERRORS,
    Authed,
    IdempotencyKey,
    ServiceDep,
)
from learning_game_backend.api.schemas import (
    ActiveAttemptResponse,
    AnswerRequest,
    AnswerResponse,
    BattleStartResponse,
    OptionalQuestionSet,
    PlayerStateResponse,
    PracticeAttemptResponse,
    StatusResponse,
)

router = APIRouter()


@router.get(
    "/api/me/state",
    response_model=PlayerStateResponse,
    responses=COMMON_ERRORS,
    tags=["player"],
)
def my_state(account: Authed, service: ServiceDep) -> dict[str, Any]:
    return service.get_state(account)


@router.get(
    "/api/me/status",
    response_model=StatusResponse,
    responses=COMMON_ERRORS,
    tags=["player"],
)
def my_status(account: Authed, service: ServiceDep) -> dict[str, Any]:
    """Compact HUD view. Small responses are not gzip-compressed."""
    return service.get_status(account)


@router.get(
    "/api/me/export",
    responses={200: {"content": {"application/gzip": {}}}, **COMMON_ERRORS},
    tags=["player"],
)
def my_export(account: Authed, service: ServiceDep) -> Response:
    """Download a gzip JSON copy of your progress. It cannot be re-imported."""
    return Response(
        service.export_progress(account),
        media_type="application/gzip",
        headers={"Content-Disposition": 'attachment; filename="progress.json.gz"'},
    )


@router.get(
    "/api/me/active-attempt",
    response_model=ActiveAttemptResponse,
    responses=COMMON_ERRORS,
    tags=["play"],
)
def active_attempt(account: Authed, service: ServiceDep) -> dict[str, Any]:
    """The pending question, if any. Creates and changes nothing."""
    return {"attempt": service.get_active_attempt(account)}


@router.post(
    "/api/practice/attempts",
    response_model=PracticeAttemptResponse,
    responses=COMMON_ERRORS,
    tags=["play"],
)
def practice_attempt(
    account: Authed,
    response: Response,
    service: ServiceDep,
    body: OptionalQuestionSet | None = None,
) -> dict[str, Any]:
    """Select the next practice question. Returns the pending one if present."""
    attempt, created = service.create_practice_attempt(
        account, body.question_set_id if body else None
    )
    response.status_code = 201 if created else 200
    return {"created": created, "attempt": attempt}


@router.post(
    "/api/adventure/battles",
    response_model=BattleStartResponse,
    responses=COMMON_ERRORS,
    tags=["play"],
)
def start_battle(
    account: Authed,
    idempotency_key: IdempotencyKey,
    service: ServiceDep,
    body: OptionalQuestionSet | None = None,
) -> dict[str, Any]:
    """Start the next battle and charge the entry cost once per key."""
    return service.start_battle(
        account, idempotency_key, body.question_set_id if body else None
    )


@router.post(
    "/api/attempts/{attempt_id}/answer",
    response_model=AnswerResponse,
    responses=COMMON_ERRORS,
    tags=["play"],
)
def answer(
    account: Authed,
    attempt_id: str,
    body: AnswerRequest,
    idempotency_key: IdempotencyKey,
    service: ServiceDep,
) -> dict[str, Any]:
    """Grade server-side and apply XP/health atomically.

    Retrying with the same Idempotency-Key and answer returns the stored
    result. Unusable input (HTTP 422) does not use up the attempt.
    """
    return service.submit_answer(account, attempt_id, body.answer, idempotency_key)

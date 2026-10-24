"""Requesting and reading generated question sets."""

from typing import Any

from fastapi import APIRouter, BackgroundTasks

from learning_game_backend.api.dependencies import (
    COMMON_ERRORS,
    Authed,
    ServiceDep,
)
from learning_game_backend.api.schemas import (
    ErrorResponse,
    QuestionSetRequest,
    QuestionSetResponse,
)

router = APIRouter(prefix="/api/question-sets", tags=["question sets"])


@router.post(
    "",
    response_model=QuestionSetResponse,
    status_code=202,
    responses={**COMMON_ERRORS, 503: {"model": ErrorResponse}},
)
def create_question_set(
    account: Authed,
    body: QuestionSetRequest,
    tasks: BackgroundTasks,
    service: ServiceDep,
) -> dict[str, Any]:
    """Request generation from your ready documents. Poll the question set."""
    created = service.request_question_set(
        account,
        body.document_ids,
        body.mode,
        body.topic,
        body.count,
        body.difficulty_min,
        body.difficulty_max,
    )
    tasks.add_task(service.generate_question_set, created["question_set_id"])
    return created


@router.get(
    "/{question_set_id}",
    response_model=QuestionSetResponse,
    responses=COMMON_ERRORS,
)
def get_question_set(
    account: Authed, question_set_id: str, service: ServiceDep
) -> dict[str, Any]:
    """Metadata and safe question summaries. Never includes answers."""
    return service.get_question_set(account, question_set_id)

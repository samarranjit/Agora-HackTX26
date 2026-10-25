"""Upload a PDF once and get playable practice and adventure questions from it."""

from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, File, Form, UploadFile

from learning_game_backend.api.dependencies import (
    COMMON_ERRORS,
    Authed,
    ServiceDep,
    SettingsDep,
)
from learning_game_backend.api.schemas import (
    ErrorResponse,
    StudyPackListResponse,
    StudyPackResponse,
)
from learning_game_backend.documents.storage import display_name

router = APIRouter(prefix="/api/study-packs", tags=["study packs"])

DEFAULT_TOPIC = "The main ideas of the document"


@router.post(
    "",
    response_model=StudyPackResponse,
    status_code=202,
    responses={
        **COMMON_ERRORS,
        411: {"model": ErrorResponse},
        413: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
def create_study_pack(
    account: Authed,
    tasks: BackgroundTasks,
    file: Annotated[UploadFile, File(description="The PDF to learn from.")],
    service: ServiceDep,
    settings: SettingsDep,
    topic: Annotated[
        str,
        Form(
            max_length=200,
            description="What to focus on. Blank means the whole document.",
        ),
    ] = "",
    practice_count: Annotated[
        int,
        Form(ge=1, le=30, description="How many practice questions to write."),
    ] = 10,
) -> dict[str, Any]:
    """Submit a PDF. The backend stores it, has it indexed, and writes the questions.

    Returns at once with status "processing". Poll `GET /api/study-packs/{document_id}`
    until `status` is "ready" (or "failed"), then call the practice and adventure
    endpoints as usual.
    """
    data = file.file.read(settings.max_upload_bytes + 1)
    pack = service.create_study_pack(
        account,
        display_name(file.filename),
        data,
        topic.strip() or DEFAULT_TOPIC,
        practice_count,
    )
    tasks.add_task(service.run_study_pack, pack["document_id"])
    return pack


@router.get(
    "",
    response_model=StudyPackListResponse,
    responses=COMMON_ERRORS,
)
def list_study_packs(account: Authed, service: ServiceDep) -> dict[str, Any]:
    """Your uploaded PDFs, newest first."""
    return {"study_packs": service.list_study_packs(account)}


@router.get(
    "/{document_id}",
    response_model=StudyPackResponse,
    responses=COMMON_ERRORS,
)
def get_study_pack(
    account: Authed, document_id: str, service: ServiceDep
) -> dict[str, Any]:
    """Progress of one pack. Someone else's pack looks like a 404."""
    return service.get_study_pack(account, document_id)

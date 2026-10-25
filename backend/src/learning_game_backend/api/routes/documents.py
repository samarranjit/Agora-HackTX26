"""PDF upload and ingestion status."""

from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, File, UploadFile

from learning_game_backend.api.dependencies import (
    COMMON_ERRORS,
    Authed,
    ServiceDep,
    SettingsDep,
)
from learning_game_backend.api.schemas import DocumentResponse, ErrorResponse
from learning_game_backend.documents.storage import display_name

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.post(
    "",
    response_model=DocumentResponse,
    status_code=202,
    responses={
        **COMMON_ERRORS,
        413: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
def upload_document(
    account: Authed,
    tasks: BackgroundTasks,
    file: Annotated[UploadFile, File()],
    service: ServiceDep,
    settings: SettingsDep,
) -> dict[str, Any]:
    """Upload a PDF. Ingestion runs in the background; poll the document."""
    data = file.file.read(settings.max_upload_bytes + 1)
    document = service.upload_document(account, display_name(file.filename), data)
    tasks.add_task(service.ingest_document, document["document_id"])
    return document


@router.get("/{document_id}", response_model=DocumentResponse, responses=COMMON_ERRORS)
def get_document(
    account: Authed, document_id: str, service: ServiceDep
) -> dict[str, Any]:
    return service.get_document(account, document_id)

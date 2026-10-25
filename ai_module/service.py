"""HTTP service that lets the game backend use this Gemini pipeline.

It implements the backend's RAG contract (version 1), documented in
backend/contracts/rag-contract.md:

    POST /v1/documents      multipart: file, document_id   -> {"status": "ready"}
    POST /v1/question-sets  JSON request                    -> questions + answers

Unlike the learning-path script, the service keeps each PDF indexed in its own
Gemini File Search store until it is deleted (DELETE /v1/documents/{id}), so
questions can be generated later, for any topic, count, and difficulty range.

Run:  python -m ai_module.service        (needs GEMINI_API_KEY and RAG_API_KEY)
Test: see ai_module/SERVICE.md

The service never sees players, XP, or progress. It only returns questions.
"""

import hmac
import json
import logging
import os
import re
import tempfile
import threading
import time
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Any, Literal, Protocol

from fastapi import Depends, FastAPI, File, Form, Header, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field, model_validator
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import contract_adapter as adapter
from .config import MODEL, MODELS
from .contract_adapter import ContractQuestion, ContractQuestionBatch, PageIndex

logger = logging.getLogger("ai_module.service")

DOCUMENT_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
MAX_PDF_BYTES = 50 * 1024 * 1024
PIPELINE_VERSION = "ai_module-gemini-file-search"
PROMPT_VERSION = "contract-v1"
GENERATION_ATTEMPTS = 3
RECITATION_FEEDBACK = (
    "it was blocked for copying too much of the document; write every question, option and "
    "explanation in your own words, and keep each source_quote under 15 words"
)


OVERLOAD_PAUSE_SECONDS = 8  # wait before asking again after every model reported being busy
BUSY_MESSAGE = "The question generator is very busy right now. Please try again in a minute."


class GeminiBusy(Exception):
    """Every configured Gemini model was overloaded or unavailable."""


def is_overloaded(exc: Exception) -> bool:
    """Whether a Gemini failure is about capacity or availability rather than the request.

    Those are worth retrying on another model. A blocked or invalid request is not.
    """
    status = getattr(exc, "status_code", None)
    if status in (429, 500, 502, 503, 504):
        return True
    text = str(exc).lower()
    if "no longer available" in text or ("model" in text and "not found" in text):
        return True
    return any(word in text for word in ("too_many_requests", "high demand", "overloaded", "resource_exhausted", "unavailable"))


def _is_recitation_block(exc: Exception) -> bool:
    """Gemini's copyright/recitation filter, which the SDK reports only as an error message."""
    text = str(exc).lower()
    return "recitation" in text or "copyrighted" in text


class ServiceError(Exception):
    """A request that cannot be served. `message` is safe to show to players."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


# ---------- Settings ----------


@dataclass(frozen=True)
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(__file__).resolve().parent / ".data")
    api_key: str | None = field(default=None, repr=False)
    allow_no_auth: bool = False

    @classmethod
    def from_env(cls) -> "Settings":
        key = (os.environ.get("RAG_API_KEY") or "").strip() or None
        data_dir = os.environ.get("RAG_DATA_DIR")
        return cls(
            data_dir=Path(data_dir).expanduser() if data_dir else cls().data_dir,
            api_key=key,
            allow_no_auth=os.environ.get("RAG_ALLOW_NO_AUTH", "").lower() in {"1", "true", "yes"},
        )


# ---------- The Gemini boundary (replaceable in tests) ----------


class Engine(Protocol):
    def index(self, pdf_path: Path, display_name: str) -> str:
        """Upload and index a PDF. Returns the File Search store name."""
        ...

    def delete(self, store_name: str) -> None: ...

    def write_questions(
        self, prompt: str, store_names: Sequence[str]
    ) -> ContractQuestionBatch: ...


class GeminiEngine:
    """The real engine. Reuses this package's own Gemini helpers and call style."""

    def index(self, pdf_path: Path, display_name: str) -> str:
        from . import gemini

        return gemini.create_store_and_index(str(pdf_path), display_name)

    def delete(self, store_name: str) -> None:
        from . import gemini

        gemini.delete_store(store_name)

    last_model = MODEL  # informational: the model that wrote the most recent batch

    def write_questions(self, prompt: str, store_names: Sequence[str]) -> ContractQuestionBatch:
        busy: Exception | None = None
        for model in MODELS:
            try:
                batch = self._write_with(model, prompt, store_names)
            except Exception as exc:
                if not is_overloaded(exc):
                    raise
                busy = exc
                logger.warning("Gemini model %s is overloaded or unavailable; trying the next one", model)
                continue
            if model != MODELS[0]:
                logger.warning("Questions were written by the fallback model %s", model)
            self.last_model = model
            return batch
        raise GeminiBusy("every configured Gemini model is overloaded") from busy

    def _write_with(self, model: str, prompt: str, store_names: Sequence[str]) -> ContractQuestionBatch:
        from pydantic import ValidationError

        from . import gemini

        last_error = ""
        for attempt in (1, 2):
            full_prompt = prompt
            if last_error:
                full_prompt += (
                    f"\n\nYour previous answer was invalid ({last_error}). "
                    "Return valid JSON that follows the schema exactly."
                )
            interaction = gemini.client.interactions.create(
                model=model,
                input=full_prompt,
                # One store per document; File Search can query several at once.
                tools=[{"type": "file_search", "file_search_store_names": list(store_names)}],
                response_format={
                    "type": "text",
                    "mime_type": "application/json",
                    "schema": ContractQuestionBatch.model_json_schema(),
                },
            )
            try:
                return ContractQuestionBatch.model_validate_json(interaction.output_text)
            except ValidationError as exc:
                last_error = str(exc)[:300]
                logger.warning("Invalid question JSON (attempt %d): %s", attempt, last_error)
        raise ValueError(f"Gemini returned invalid JSON after retries: {last_error}")


# ---------- Document registry ----------


class Registry:
    """Which document IDs are indexed, and where. Saved to disk so a restart keeps them."""

    def __init__(self, data_dir: Path) -> None:
        self.pdf_dir = data_dir / "pdfs"
        self._path = data_dir / "registry.json"
        self._lock = threading.Lock()
        self._doc_locks: dict[str, threading.Lock] = {}
        self._items: dict[str, dict[str, Any]] = {}
        self._pages: dict[str, PageIndex] = {}
        self.pdf_dir.mkdir(parents=True, exist_ok=True)
        if self._path.is_file():
            self._items = json.loads(self._path.read_text(encoding="utf-8"))

    def document_lock(self, document_id: str) -> threading.Lock:
        with self._lock:
            return self._doc_locks.setdefault(document_id, threading.Lock())

    def get(self, document_id: str) -> dict[str, Any] | None:
        with self._lock:
            return self._items.get(document_id)

    def add(self, document_id: str, store_name: str, page_count: int) -> None:
        with self._lock:
            self._items[document_id] = {
                "store": store_name,
                "pages": page_count,
                "indexed_at": datetime.now(UTC).isoformat(timespec="seconds"),
            }
            self._save()

    def remove(self, document_id: str) -> dict[str, Any] | None:
        with self._lock:
            item = self._items.pop(document_id, None)
            self._pages.pop(document_id, None)
            self._save()
            return item

    def pdf_path(self, document_id: str) -> Path:
        return self.pdf_dir / f"{document_id}.pdf"

    def page_index(self, document_id: str) -> PageIndex | None:
        """Page text for locating quotes; None if the PDF cannot be read."""
        with self._lock:
            cached = self._pages.get(document_id)
        if cached is not None:
            return cached
        try:
            index = PageIndex.from_pdf(self.pdf_path(document_id))
        except Exception:  # unreadable or missing PDF: pages are simply not provided
            logger.warning("Could not read pages of %s", document_id, exc_info=True)
            return None
        with self._lock:
            self._pages[document_id] = index
        return index

    def _save(self) -> None:
        fd, temp = tempfile.mkstemp(dir=self._path.parent, suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as file:
                json.dump(self._items, file, indent=2)
            os.replace(temp, self._path)
        finally:
            Path(temp).unlink(missing_ok=True)


# ---------- Request model (the backend's contract, version 1) ----------


class QuestionSetRequest(BaseModel):
    contract_version: Literal[1]
    question_set_id: str = Field(min_length=1, max_length=64)
    document_ids: list[str] = Field(min_length=1, max_length=10)
    topic: str = Field(min_length=1, max_length=200)
    mode: Literal["practice", "adventure"]
    count: int = Field(ge=1, le=50)
    difficulty_min: int = Field(default=1, ge=1, le=5)
    difficulty_max: int = Field(default=5, ge=1, le=5)

    @model_validator(mode="after")
    def check_range(self) -> "QuestionSetRequest":
        if self.difficulty_min > self.difficulty_max:
            raise ValueError("difficulty_min cannot exceed difficulty_max")
        return self


# ---------- The service ----------


class GameMasterService:
    def __init__(self, engine: Engine, registry: Registry) -> None:
        self.engine = engine
        self.registry = registry

    def ingest(self, document_id: str, data: bytes) -> dict[str, str]:
        """Index a PDF once. Repeating a known document_id is a no-op."""
        with self.registry.document_lock(document_id):
            if self.registry.get(document_id) is not None:
                return {"status": "ready"}
            try:
                page_count = _check_pdf(data)
            except ValueError as exc:
                return {"status": "failed", "error": str(exc)}
            path = self.registry.pdf_path(document_id)
            path.write_bytes(data)
            store = None
            try:
                # The store's display name is the document ID, which is how a
                # citation can be traced back to a document.
                store = self.engine.index(path, document_id)
                self.registry.add(document_id, store, page_count)
            except Exception:
                logger.exception("Indexing failed for %s", document_id)
                path.unlink(missing_ok=True)
                if store is not None:
                    self._delete_store_quietly(store)
                return {"status": "failed", "error": "Indexing the PDF failed. Please try again."}
            return {"status": "ready"}

    def delete(self, document_id: str) -> bool:
        with self.registry.document_lock(document_id):
            item = self.registry.remove(document_id)
            self.registry.pdf_path(document_id).unlink(missing_ok=True)
        if item is None:
            return False
        self._delete_store_quietly(item["store"])
        return True

    def generate(self, request: QuestionSetRequest) -> dict[str, Any]:
        document_ids = list(dict.fromkeys(request.document_ids))
        stores = []
        for document_id in document_ids:
            item = self.registry.get(document_id) if DOCUMENT_ID_PATTERN.match(document_id) else None
            if item is None:
                raise ServiceError(404, f"Document {document_id} has not been ingested.")
            stores.append(item["store"])

        plan = adapter.plan_difficulties(request.count, request.difficulty_min, request.difficulty_max)
        chunks = adapter.split_plan(plan)
        with ThreadPoolExecutor(max_workers=len(chunks)) as pool:
            results = list(pool.map(lambda c: self._write_chunk(request.topic, c, stores), chunks))
        pairs = adapter.drop_duplicates([pair for chunk in results for pair in chunk])

        indexes = {d: i for d in document_ids if (i := self.registry.page_index(d)) is not None}
        questions = []
        for number, (source, level) in enumerate(pairs, 1):
            sources = adapter.locate_sources(source.source_quote, indexes, document_ids)
            try:
                questions.append(
                    adapter.build_question(number, request.mode, request.topic, level, source, sources)
                )
            except ValueError as exc:
                raise ServiceError(502, f"The question generator returned an unusable question: {exc}.") from None
        return {
            "schema_version": adapter.CONTRACT_VERSION,
            "generation": {
                "provider_question_set_id": request.question_set_id,
                "model": getattr(self.engine, "last_model", MODEL),
                "prompt_version": PROMPT_VERSION,
                "pipeline_version": PIPELINE_VERSION,
                "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
            },
            "questions": questions,
        }

    def _write_chunk(
        self, topic: str, plan: list[int], stores: Sequence[str]
    ) -> list[tuple[ContractQuestion, int]]:
        feedback = None
        for attempt in range(1, GENERATION_ATTEMPTS + 1):
            prompt = adapter.questions_prompt(topic, plan, feedback)
            start = time.perf_counter()
            try:
                batch = self.engine.write_questions(prompt, stores)
            except GeminiBusy:
                logger.warning("All Gemini models are busy (attempt %d/%d)", attempt, GENERATION_ATTEMPTS)
                if attempt < GENERATION_ATTEMPTS:
                    time.sleep(OVERLOAD_PAUSE_SECONDS)
                    continue
                raise ServiceError(503, BUSY_MESSAGE) from None
            except Exception as exc:
                if _is_recitation_block(exc) and attempt < GENERATION_ATTEMPTS:
                    # Gemini refuses answers that copy too much of a published text.
                    # Asking again for paraphrased questions and a shorter quote
                    # usually succeeds.
                    logger.warning("Gemini blocked the answer as recitation; asking again in its own words")
                    feedback = RECITATION_FEEDBACK
                    continue
                logger.exception("Gemini call failed")
                raise ServiceError(502, "The question generator is unavailable. Please try again.") from None
            logger.info("Gemini wrote %d/%d questions in %.1fs", len(batch.questions), len(plan), time.perf_counter() - start)
            try:
                ordered, followed = adapter.align_to_plan(batch.questions, plan)
            except ValueError as exc:
                feedback = str(exc)
                continue
            if not followed:
                logger.warning(
                    "Gemini's difficulty labels %s differ from the plan %s; using planned levels by position",
                    [q.difficulty for q in batch.questions], plan,
                )  # fmt: skip
            return list(zip(ordered, plan, strict=True))
        raise ServiceError(502, f"The question generator did not return {len(plan)} questions.")

    def _delete_store_quietly(self, store_name: str) -> None:
        try:
            self.engine.delete(store_name)
        except Exception:
            logger.warning("Could not delete store %s", store_name, exc_info=True)


def _check_pdf(data: bytes) -> int:
    """Number of pages, or ValueError with a message safe to show."""
    if not data:
        raise ValueError("The uploaded file is empty.")
    if len(data) > MAX_PDF_BYTES:
        raise ValueError("The PDF is too large.")
    if not data.startswith(b"%PDF-"):
        raise ValueError("The file is not a PDF.")
    from io import BytesIO

    from pypdf import PdfReader

    try:
        reader = PdfReader(BytesIO(data))
        if reader.is_encrypted:
            raise ValueError("Encrypted PDFs are not supported.")
        pages = len(reader.pages)
    except ValueError:
        raise
    except Exception:
        raise ValueError("The PDF could not be read.") from None
    if pages == 0:
        raise ValueError("The PDF has no pages.")
    return pages


# ---------- HTTP app ----------


def create_app(
    engine: Engine | None = None, settings: Settings | None = None
) -> FastAPI:
    settings = settings or Settings.from_env()
    if settings.api_key is None and not settings.allow_no_auth:
        raise RuntimeError(
            "Set RAG_API_KEY (the same value as the backend's GAME_MASTER_API_KEY), "
            "or RAG_ALLOW_NO_AUTH=true for local experiments."
        )
    service = GameMasterService(engine or GeminiEngine(), Registry(settings.data_dir))
    app = FastAPI(title="Learning game: Gemini game master", version="1.0")
    app.state.service = service

    def require_key(authorization: Annotated[str | None, Header()] = None) -> None:
        if settings.api_key is None:
            return
        expected = f"Bearer {settings.api_key}"
        if authorization is None or not hmac.compare_digest(authorization, expected):
            raise ServiceError(401, "Missing or invalid API key.")

    needs_key = Depends(require_key)

    @app.exception_handler(ServiceError)
    async def service_error(_: Request, exc: ServiceError) -> JSONResponse:
        return JSONResponse({"error": exc.message}, status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0]
        where = ".".join(str(p) for p in first["loc"] if p != "body")
        return JSONResponse({"error": f"Invalid request: {where}: {first['msg']}"}, status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def unexpected(_: Request, exc: Exception) -> JSONResponse:
        logger.error("Unhandled %s", type(exc).__name__)
        return JSONResponse({"error": "Internal error."}, status_code=500)

    @app.get("/healthz")
    def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/v1/documents", dependencies=[needs_key])
    def ingest_document(
        file: Annotated[UploadFile, File()], document_id: Annotated[str, Form()]
    ) -> dict[str, str]:
        if not DOCUMENT_ID_PATTERN.match(document_id):
            raise ServiceError(422, "document_id must be 1-64 letters, digits, '_' or '-'.")
        data = file.file.read(MAX_PDF_BYTES + 1)
        return service.ingest(document_id, data)

    @app.post("/v1/question-sets", dependencies=[needs_key])
    def create_question_set(body: QuestionSetRequest) -> dict[str, Any]:
        return service.generate(body)

    @app.delete("/v1/documents/{document_id}", dependencies=[needs_key], status_code=204)
    def delete_document(document_id: str) -> Response:
        if not DOCUMENT_ID_PATTERN.match(document_id) or not service.delete(document_id):
            raise ServiceError(404, "No such document.")
        return Response(status_code=204)

    return app


def create_app_from_env() -> FastAPI:
    return create_app()


def main() -> None:
    import uvicorn

    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(name)s | %(message)s")
    uvicorn.run(
        "ai_module.service:create_app_from_env",
        factory=True,
        host=os.environ.get("RAG_HOST", "127.0.0.1"),
        port=int(os.environ.get("RAG_PORT", "9000")),
    )


if __name__ == "__main__":
    main()

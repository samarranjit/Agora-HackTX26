"""Validation of everything a game master returns, before it becomes playable.

Provider output is untrusted. validate_generated_set() turns raw JSON into
GeneratedQuestion objects or rejects the whole set. Unknown fields (for example
"award 10000 XP") are ignored: rewards are decided by the engine's rules, never
by generated content. Document text is treated purely as data.
"""

import re
from collections.abc import Mapping, Sequence
from decimal import Decimal, InvalidOperation
from typing import Any

from learning_game_engine.rules import (
    MAX_DIFFICULTY,
    MIN_DIFFICULTY,
    is_valid_difficulty,
)

from learning_game_backend.rag.schemas import (
    CONTRACT_VERSION,
    GeneratedQuestion,
    GeneratedSet,
    GenerationRequest,
    Option,
    QuestionType,
    SourceRef,
)

MAX_TEXT = 4000
MAX_SHORT_TEXT = 200
MIN_OPTIONS = 2
MAX_OPTIONS = 6
MAX_PAGE = 100_000
OPTION_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,32}$")
# Only these generation metadata keys are kept, for traceability.
GENERATION_METADATA_KEYS = (
    "provider_question_set_id",
    "model",
    "prompt_version",
    "pipeline_version",
    "generated_at",
)


class GenerationValidationError(ValueError):
    """The game master's output is not playable. The message is safe to show."""


def validate_generated_set(raw: object, request: GenerationRequest) -> GeneratedSet:
    """Check provider output against the contract and the request.

    Raises GenerationValidationError naming the first problem found. Nothing
    from a rejected set becomes playable.
    """
    data = _object(raw, "response")
    if data.get("schema_version") != CONTRACT_VERSION:
        raise GenerationValidationError(
            f"Unsupported schema_version {data.get('schema_version')!r}; "
            f"expected {CONTRACT_VERSION}."
        )
    items = data.get("questions")
    if not isinstance(items, list) or not items:
        raise GenerationValidationError("'questions' must be a non-empty list.")
    if len(items) > request.count:
        raise GenerationValidationError(
            f"Received {len(items)} questions but only {request.count} were requested."
        )

    questions = tuple(
        _question(item, f"question {index + 1}", request)
        for index, item in enumerate(items)
    )
    seen: set[str] = set()
    for question in questions:
        if question.source_question_id in seen:
            raise GenerationValidationError(
                f"Duplicate question id {question.source_question_id!r}."
            )
        seen.add(question.source_question_id)

    generation: dict[str, str] = {}
    metadata = data.get("generation")
    if isinstance(metadata, dict):
        for key in GENERATION_METADATA_KEYS:
            value = metadata.get(key)
            if isinstance(value, str) and value.strip():
                generation[key] = value.strip()[:MAX_SHORT_TEXT]
    return GeneratedSet(questions=questions, generation=generation)


def _question(raw: object, where: str, request: GenerationRequest) -> GeneratedQuestion:
    data = _object(raw, where)
    source_id = _text(data, "id", where, MAX_SHORT_TEXT)

    type_text = data.get("type")
    try:
        question_type = QuestionType(str(type_text))
    except ValueError:
        supported = ", ".join(t.value for t in QuestionType)
        raise GenerationValidationError(
            f"{where}: unsupported type {type_text!r} (supported: {supported})."
        ) from None

    mode_text = data.get("mode", request.mode.value)
    if mode_text != request.mode.value:
        raise GenerationValidationError(
            f"{where}: mode {mode_text!r} does not match the requested "
            f"{request.mode.value!r}."
        )

    difficulty = data.get("difficulty")
    if not is_valid_difficulty(difficulty):
        raise GenerationValidationError(
            f"{where}: 'difficulty' must be a whole number from "
            f"{MIN_DIFFICULTY} to {MAX_DIFFICULTY}."
        )
    assert isinstance(difficulty, int)

    answer = data.get("answer")
    if not isinstance(answer, dict):
        raise GenerationValidationError(f"{where}: 'answer' is missing.")
    options: tuple[Option, ...] = ()
    numeric_answer: Decimal | None = None
    tolerance = Decimal(0)
    correct_option_id: str | None = None
    if question_type is QuestionType.NUMERIC:
        numeric_answer = _decimal(answer.get("value"), f"{where}: answer value")
        grading = data.get("grading")
        if isinstance(grading, dict) and "tolerance" in grading:
            tolerance = _decimal(grading["tolerance"], f"{where}: tolerance")
            if tolerance < 0:
                raise GenerationValidationError(
                    f"{where}: tolerance cannot be negative."
                )
    else:
        options = _options(data.get("options"), where)
        correct_option_id = answer.get("option_id")
        if correct_option_id not in {option.id for option in options}:
            raise GenerationValidationError(
                f"{where}: answer option_id must be one of the option ids."
            )

    learning_objective = data.get("learning_objective")
    return GeneratedQuestion(
        source_question_id=source_id,
        content_version=CONTRACT_VERSION,
        mode=request.mode,
        question_type=question_type,
        topic=_optional_text(data, "topic", where) or request.topic,
        learning_objective=(
            _optional_text(data, "learning_objective", where)
            if learning_objective is not None
            else None
        ),
        prompt=_text(data, "prompt", where, MAX_TEXT),
        options=options,
        explanation=_text(data, "explanation", where, MAX_TEXT),
        difficulty=difficulty,
        sources=_sources(data.get("sources"), where, request.document_ids),
        numeric_answer=numeric_answer,
        tolerance=tolerance,
        correct_option_id=correct_option_id,
    )


def _options(raw: object, where: str) -> tuple[Option, ...]:
    if not isinstance(raw, list) or not MIN_OPTIONS <= len(raw) <= MAX_OPTIONS:
        raise GenerationValidationError(
            f"{where}: multiple choice needs {MIN_OPTIONS}-{MAX_OPTIONS} options."
        )
    options = []
    for item in raw:
        data = _object(item, f"{where} option")
        option_id = data.get("id")
        if not isinstance(option_id, str) or not OPTION_ID_PATTERN.fullmatch(option_id):
            raise GenerationValidationError(
                f"{where}: option ids must be 1-32 letters, digits, '_' or '-'."
            )
        options.append(Option(option_id, _text(data, "text", where, MAX_TEXT)))
    if len({option.id for option in options}) != len(options):
        raise GenerationValidationError(f"{where}: option ids must be unique.")
    return tuple(options)


def _sources(
    raw: object, where: str, allowed_documents: Sequence[str]
) -> tuple[SourceRef, ...]:
    if raw is None:
        return ()
    if not isinstance(raw, list):
        raise GenerationValidationError(f"{where}: 'sources' must be a list.")
    sources = []
    for item in raw:
        data = _object(item, f"{where} source")
        document_id = data.get("document_id")
        if document_id not in allowed_documents:
            raise GenerationValidationError(
                f"{where}: cites a document that was not part of the request."
            )
        assert isinstance(document_id, str)
        pages_raw = data.get("pages", [])
        if not isinstance(pages_raw, list) or not all(
            isinstance(page, int)
            and not isinstance(page, bool)
            and 1 <= page <= MAX_PAGE
            for page in pages_raw
        ):
            raise GenerationValidationError(
                f"{where}: source pages must be positive whole numbers."
            )
        sources.append(SourceRef(document_id, tuple(pages_raw)))
    return tuple(sources)


def _object(value: object, where: str) -> Mapping[str, Any]:
    if not isinstance(value, dict):
        raise GenerationValidationError(f"{where}: expected a JSON object.")
    return value


def _text(data: Mapping[str, Any], key: str, where: str, limit: int) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise GenerationValidationError(f"{where}: '{key}' is missing or empty.")
    if len(value) > limit:
        raise GenerationValidationError(f"{where}: '{key}' is too long.")
    return value.strip()


def _optional_text(data: Mapping[str, Any], key: str, where: str) -> str | None:
    if data.get(key) is None:
        return None
    return _text(data, key, where, MAX_SHORT_TEXT)


def _decimal(value: object, where: str) -> Decimal:
    if isinstance(value, bool) or not isinstance(value, int | float | str):
        raise GenerationValidationError(f"{where} must be a number.")
    try:
        number = Decimal(str(value).strip())
    except InvalidOperation:
        raise GenerationValidationError(f"{where} must be a number.") from None
    if not number.is_finite():
        raise GenerationValidationError(f"{where} must be finite.")
    return number

"""Data shapes exchanged with the game master (RAG service) and kept after validation.

GenerationRequest is what the backend sends. GeneratedQuestion is what a
question becomes once validation (validation.py) accepts it. The private answer
fields are excluded from repr so they do not end up in logs. The wire format is
documented in contracts/rag-contract.md.
"""

from dataclasses import dataclass, field
from decimal import Decimal
from enum import StrEnum

from learning_game_engine.rules import MAX_DIFFICULTY, MIN_DIFFICULTY

CONTRACT_VERSION = 1


class QuestionMode(StrEnum):
    PRACTICE = "practice"
    ADVENTURE = "adventure"


class QuestionType(StrEnum):
    NUMERIC = "numeric"
    MULTIPLE_CHOICE = "multiple_choice"


@dataclass(frozen=True)
class GenerationRequest:
    question_set_id: str
    document_ids: tuple[str, ...]
    topic: str
    mode: QuestionMode
    count: int
    difficulty_min: int = MIN_DIFFICULTY
    difficulty_max: int = MAX_DIFFICULTY


@dataclass(frozen=True)
class SourceRef:
    """Where a question came from. pages is empty unless the pipeline gave pages."""

    document_id: str
    pages: tuple[int, ...] = ()


@dataclass(frozen=True)
class Option:
    id: str
    text: str


@dataclass(frozen=True)
class GeneratedQuestion:
    """A validated question. The answer fields are private to the server."""

    source_question_id: str
    content_version: int
    mode: QuestionMode
    question_type: QuestionType
    topic: str
    learning_objective: str | None
    prompt: str
    options: tuple[Option, ...]
    explanation: str
    difficulty: int
    sources: tuple[SourceRef, ...]
    # Private answer key: exactly one of these is set, matching question_type.
    numeric_answer: Decimal | None = field(default=None, repr=False)
    tolerance: Decimal = field(default=Decimal(0), repr=False)
    correct_option_id: str | None = field(default=None, repr=False)


@dataclass(frozen=True)
class GeneratedSet:
    questions: tuple[GeneratedQuestion, ...]
    generation: dict[str, str]

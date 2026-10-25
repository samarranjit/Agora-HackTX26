"""Pure logic that adapts this pipeline's output to the game backend's RAG contract.

Nothing here talks to Gemini or the network, so it can be tested offline. The
contract itself is documented in backend/contracts/rag-contract.md (version 1).

What the backend needs that the original learning-path flow does not provide:
  * a question *difficulty* from 1 to 5 (the pipeline had none),
  * questions for a requested topic, count, and difficulty range,
  * a `type`, the correct answer, and source references,
  * page numbers, only when they can be verified in the PDF text.
"""

import re
import unicodedata
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

from .schemas import Option, OptionId

CONTRACT_VERSION = 1
MIN_DIFFICULTY = 1
MAX_DIFFICULTY = 5
BATCH_SIZE = 10  # questions per Gemini call; larger requests are split and run in parallel
MIN_QUOTE_CHARS = 30  # letters and digits; shorter quotes match too many places to prove a page
ANCHOR_CHARS = 24  # for longer quotes: how much of each end must be found
MIN_ANCHORED_QUOTE_CHARS = 60  # only quotes this long may use the two-ends check
MAX_TEXT = 4000  # the backend rejects longer prompts and explanations


# ---------- What Gemini returns for one batch (INTERNAL) ----------


class ContractQuestion(BaseModel):
    """One multiple-choice question written for a requested difficulty level."""

    difficulty: int
    question: str
    options: list[Option] = Field(min_length=4, max_length=4)
    correct_option_id: OptionId
    explanation: str
    source_quote: str  # a passage copied from the document, used to find the page

    @field_validator("difficulty")
    @classmethod
    def difficulty_in_range(cls, value: int) -> int:
        if not MIN_DIFFICULTY <= value <= MAX_DIFFICULTY:
            raise ValueError(f"difficulty must be {MIN_DIFFICULTY}-{MAX_DIFFICULTY}")
        return value

    @model_validator(mode="after")
    def option_ids_are_a_to_d(self) -> "ContractQuestion":
        if sorted(o.id for o in self.options) != ["a", "b", "c", "d"]:
            raise ValueError("options must have ids a, b, c, d exactly once")
        return self


class ContractQuestionBatch(BaseModel):
    questions: list[ContractQuestion] = Field(min_length=1)


# ---------- Difficulty plan ----------


def plan_difficulties(count: int, low: int, high: int) -> list[int]:
    """The difficulty to target for each of `count` questions, spread evenly.

    5 questions over 1-5 give 1,2,3,4,5. 3 questions over 1-5 give 1,3,5 (the
    backend's adventure uses exactly those levels). A single question uses `low`.
    """
    if count < 1:
        raise ValueError("count must be at least 1")
    if not MIN_DIFFICULTY <= low <= high <= MAX_DIFFICULTY:
        raise ValueError("difficulty range must satisfy 1 <= min <= max <= 5")
    if count == 1:
        return [low]
    return [low + round(i * (high - low) / (count - 1)) for i in range(count)]


def split_plan(plan: Sequence[int], size: int = BATCH_SIZE) -> list[list[int]]:
    return [list(plan[i : i + size]) for i in range(0, len(plan), size)]


# ---------- Prompt ----------

DIFFICULTY_SCALE = (
    "Difficulty scale:\n"
    "1 = recall one fact stated directly in the document.\n"
    "2 = recall a fact and what it means.\n"
    "3 = connect two facts, or explain why something is true.\n"
    "4 = apply an idea from the document to a new situation.\n"
    "5 = compare or combine several ideas; needs careful reasoning."
)


def questions_prompt(topic: str, plan: Sequence[int], feedback: str | None = None) -> str:
    order = "\n".join(f"Question {i}: difficulty {d}" for i, d in enumerate(plan, 1))
    prompt = (
        "You are creating multiple-choice questions for a learning game.\n"
        f"Topic focus: {topic}\n\n"
        "Using ONLY information retrieved from the document, "
        f"write exactly {len(plan)} questions in this order, each at the requested "
        f"difficulty:\n{order}\n\n"
        f"{DIFFICULTY_SCALE}\n\n"
        "Rules:\n"
        "- Return the questions in the order listed above and set each question's "
        "difficulty field to the level requested for it.\n"
        "- Each question tests specific content from the document, not general knowledge.\n"
        "- Exactly 4 options with ids a, b, c, d. Exactly one is correct.\n"
        "- Wrong options must be plausible, not obviously silly.\n"
        "- Spread the correct answers across a, b, c and d.\n"
        "- Do not reveal the answer in the question text.\n"
        "- explanation: one sentence saying why the correct option is right.\n"
        "- source_quote: a short passage copied word for word from the document "
        "(at most 25 words) that supports the correct answer.\n"
        "- Write in the same language as the document."
    )
    if feedback:
        prompt += f"\n\nYour previous answer was not accepted ({feedback}). Try again."
    return prompt


# ---------- Aligning Gemini's answer to the plan ----------


def align_to_plan(
    questions: Sequence[ContractQuestion], plan: Sequence[int]
) -> tuple[list[ContractQuestion], bool]:
    """Order questions to match the plan. Returns (questions, followed_plan).

    followed_plan is False when Gemini's difficulty labels do not match the
    plan; the questions are then used in the order returned and the caller
    assigns the planned levels by position (the model was asked to write each
    question at that level). Raises ValueError if the count is wrong.
    """
    if len(questions) != len(plan):
        raise ValueError(f"expected {len(plan)} questions, got {len(questions)}")
    labels = [q.difficulty for q in questions]
    if labels == list(plan):
        return list(questions), True
    if sorted(labels) == sorted(plan):
        pool = list(questions)
        ordered = []
        for level in plan:
            index = next(i for i, q in enumerate(pool) if q.difficulty == level)
            ordered.append(pool.pop(index))
        return ordered, True
    return list(questions), False


# ---------- Verifying page numbers ----------


def normalize_for_matching(text: str) -> str:
    """Lowercase letters and digits only, so punctuation, ligatures, soft
    hyphens, and line-break hyphenation do not stop a real quote from matching."""
    text = unicodedata.normalize("NFKC", text).lower().replace("\u00ad", "")
    text = re.sub(r"-\s*\n\s*", "", text)
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def compact_for_matching(text: str) -> str:
    """Like normalize_for_matching, with spaces removed too.

    PDF text extraction often fuses or splits words ("afeedforward networkbecause",
    "ofz"), so comparing without spaces matches real quotes that spaced
    comparison misses.
    """
    return normalize_for_matching(text).replace(" ", "")


class PageIndex:
    """Finds which PDF pages contain a quote. Never guesses.

    A page is reported only on evidence in that page's extracted text:
      1. the whole quote appears on the page (ignoring case, punctuation, spaces), or
      2. for a longer quote, its beginning and its end both appear on the page,
         in order and close together. This covers extraction noise spliced into
         the middle, such as a margin note.
    A quote that was paraphrased, spans a page break, or is too short to be
    specific is not located, and the caller then omits pages.
    """

    def __init__(self, page_texts: Sequence[str]) -> None:
        self._pages = [compact_for_matching(text) for text in page_texts]

    @classmethod
    def from_pdf(cls, path: Path) -> "PageIndex":
        from pypdf import PdfReader  # imported here so the pure logic stays light

        reader = PdfReader(str(path))
        return cls([page.extract_text() or "" for page in reader.pages])

    def find(self, quote: str) -> list[int]:
        needle = compact_for_matching(quote)
        if len(needle) < MIN_QUOTE_CHARS:
            return []
        whole = [n for n, page in enumerate(self._pages, 1) if needle in page]
        if whole or len(needle) < MIN_ANCHORED_QUOTE_CHARS:
            return whole
        head, tail = needle[:ANCHOR_CHARS], needle[-ANCHOR_CHARS:]
        pages = []
        for number, page in enumerate(self._pages, 1):
            start, end = page.find(head), page.rfind(tail)
            if 0 <= start and start + ANCHOR_CHARS <= end + ANCHOR_CHARS <= start + 2 * len(needle):
                pages.append(number)
        return pages


def locate_sources(
    quote: str, indexes: dict[str, PageIndex], document_ids: Sequence[str]
) -> list[dict[str, Any]]:
    """Source references for one question.

    If the quote is found in exactly one document, cite that document with its
    pages. If it is found in several, cite each. If it is not found, cite the
    document only when the request involved a single document; with several
    documents the origin is unknown, so no source is claimed.
    """
    found = {}
    for document_id in document_ids:
        pages = indexes[document_id].find(quote) if document_id in indexes else []
        if pages:
            found[document_id] = pages
    if found:
        return [{"document_id": d, "pages": p} for d, p in found.items()]
    if len(document_ids) == 1:
        return [{"document_id": document_ids[0]}]
    return []


# ---------- Building the contract response ----------


def build_question(
    index: int,
    mode: str,
    topic: str,
    difficulty: int,
    source: ContractQuestion,
    sources: list[dict[str, Any]],
) -> dict[str, Any]:
    """One question in the backend's format. The mnemonic and Gemini's own XP are
    not part of the contract and are dropped; rewards belong to the game rules."""
    for label, text in (("question", source.question), ("explanation", source.explanation)):
        if not text.strip():
            raise ValueError(f"the generated {label} is empty")
        if len(text) > MAX_TEXT:
            raise ValueError(f"the generated {label} is too long")
    question: dict[str, Any] = {
        "id": f"q-{index}",
        "type": "multiple_choice",
        "mode": mode,
        "topic": topic,
        "prompt": source.question.strip(),
        "options": [{"id": o.id, "text": o.text} for o in source.options],
        "answer": {"option_id": source.correct_option_id},
        "explanation": source.explanation.strip(),
        "difficulty": difficulty,
    }
    if sources:
        question["sources"] = sources
    return question


def drop_duplicates(
    pairs: Sequence[tuple[ContractQuestion, int]],
) -> list[tuple[ContractQuestion, int]]:
    """Parallel batches can repeat a question; keep the first of identical ones.

    Each item is (question, planned difficulty).
    """
    seen: set[str] = set()
    unique = []
    for question, level in pairs:
        key = normalize_for_matching(question.question)
        if key not in seen:
            seen.add(key)
            unique.append((question, level))
    return unique

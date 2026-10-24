"""Server-side grading of generated questions using their private answer keys.

This only reports correctness; the engine decides what that means for XP and
health. InvalidAnswer means the input is unusable (blank, not a number, not
one of the options) and must not use up the attempt.
"""

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

from learning_game_backend.rag.schemas import QuestionType

MAX_ANSWER_LENGTH = 200


class InvalidAnswer(ValueError):
    """The input is not a usable answer, so it should not count as an attempt."""


def parse_number(text: str) -> Decimal:
    """Parse a typed answer such as "6", " 6.0 ", or "+6".

    Raises InvalidAnswer for blank, non-numeric, or non-finite input
    (such as "inf" or "nan").
    """
    cleaned = text.strip()
    if not cleaned:
        raise InvalidAnswer("Please type a number.")
    try:
        number = Decimal(cleaned)
    except InvalidOperation:
        raise InvalidAnswer(f"'{cleaned}' is not a number.") from None
    if not number.is_finite():
        raise InvalidAnswer("Please type a finite number.")
    return number


@dataclass(frozen=True)
class AnswerKey:
    question_type: QuestionType
    numeric_answer: Decimal | None
    tolerance: Decimal
    correct_option_id: str | None
    option_ids: tuple[str, ...]


def evaluate(key: AnswerKey, text: str) -> bool:
    """Return whether text answers the question. Raises InvalidAnswer."""
    if len(text) > MAX_ANSWER_LENGTH:
        raise InvalidAnswer("That answer is too long.")
    if key.question_type is QuestionType.NUMERIC:
        assert key.numeric_answer is not None
        return abs(parse_number(text) - key.numeric_answer) <= key.tolerance

    choice = text.strip()
    if choice not in key.option_ids:
        raise InvalidAnswer(f"Choose one of: {', '.join(key.option_ids)}.")
    return choice == key.correct_option_id

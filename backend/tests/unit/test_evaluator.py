"""Grading generated questions with their private answer keys."""

import unittest
from decimal import Decimal

from learning_game_backend.grading.evaluator import (
    AnswerKey,
    InvalidAnswer,
    evaluate,
)
from learning_game_backend.rag.schemas import (
    QuestionType,
)


class EvaluatorTests(unittest.TestCase):
    NUMERIC = AnswerKey(QuestionType.NUMERIC, Decimal(46), Decimal("0.5"), None, ())
    CHOICE = AnswerKey(QuestionType.MULTIPLE_CHOICE, None, Decimal(0), "B", ("A", "B"))

    def test_numeric_answers_use_the_tolerance(self) -> None:
        self.assertTrue(evaluate(self.NUMERIC, " 46.0 "))
        self.assertTrue(evaluate(self.NUMERIC, "46.4"))
        self.assertFalse(evaluate(self.NUMERIC, "47"))

    def test_multiple_choice(self) -> None:
        self.assertTrue(evaluate(self.CHOICE, " B "))
        self.assertFalse(evaluate(self.CHOICE, "A"))
        for text in ("C", "b", ""):
            with self.subTest(text=text), self.assertRaises(InvalidAnswer):
                evaluate(self.CHOICE, text)

    def test_unusable_numeric_input_is_invalid_not_wrong(self) -> None:
        for text in ("", "forty", "nan", "x" * 500):
            with self.subTest(text=text), self.assertRaises(InvalidAnswer):
                evaluate(self.NUMERIC, text)


if __name__ == "__main__":
    unittest.main()

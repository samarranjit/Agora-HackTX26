"""Validation of game master output before it becomes playable."""

import unittest
from decimal import Decimal

from rag_samples import DOCUMENT, REQUEST, choice, numeric, payload

from learning_game_backend.rag.fake_provider import FakeGameMaster
from learning_game_backend.rag.schemas import (
    QuestionType,
)
from learning_game_backend.rag.validation import (
    GenerationValidationError,
    validate_generated_set,
)


class ValidationTests(unittest.TestCase):
    def assert_rejected(self, raw: object, fragment: str) -> None:
        with self.assertRaisesRegex(GenerationValidationError, fragment):
            validate_generated_set(raw, REQUEST)

    def test_valid_output_becomes_playable_questions(self) -> None:
        generated = validate_generated_set(
            payload(
                numeric(),
                choice(),
                generation={"model": "m1", "prompt_version": "p2", "secret": "x"},
            ),
            REQUEST,
        )
        first, second = generated.questions
        self.assertEqual(first.numeric_answer, Decimal(46))
        self.assertEqual(first.sources[0].pages, (4, 5))
        self.assertEqual(first.topic, "Cells")
        self.assertEqual(second.question_type, QuestionType.MULTIPLE_CHOICE)
        self.assertEqual(second.correct_option_id, "B")
        self.assertEqual(generated.generation, {"model": "m1", "prompt_version": "p2"})

    def test_missing_pages_are_not_invented(self) -> None:
        question = numeric(sources=[{"document_id": DOCUMENT}])
        generated = validate_generated_set(payload(question), REQUEST)
        self.assertEqual(generated.questions[0].sources[0].pages, ())
        no_sources = numeric()
        del no_sources["sources"]
        self.assertEqual(
            validate_generated_set(payload(no_sources), REQUEST).questions[0].sources,
            (),
        )

    def test_unknown_fields_cannot_change_rewards(self) -> None:
        generated = validate_generated_set(
            payload(numeric(xp_reward=10000, health_delta=-999)), REQUEST
        )
        self.assertEqual(generated.questions[0].difficulty, 3)
        self.assertFalse(hasattr(generated.questions[0], "xp_reward"))

    def test_missing_answers_are_rejected(self) -> None:
        question = numeric()
        del question["answer"]
        self.assert_rejected(payload(question), "'answer' is missing")
        self.assert_rejected(payload(numeric(answer={})), "answer value")
        self.assert_rejected(payload(numeric(answer={"value": "lots"})), "number")
        self.assert_rejected(payload(numeric(answer={"value": True})), "number")
        self.assert_rejected(payload(numeric(answer={"value": "inf"})), "finite")

    def test_duplicate_ids_are_rejected(self) -> None:
        self.assert_rejected(payload(numeric("q1"), numeric("q1")), "Duplicate")

    def test_invalid_difficulty_is_rejected(self) -> None:
        for value in (0, 6, -1, 2.5, "3", True, None):
            with self.subTest(difficulty=value):
                self.assert_rejected(payload(numeric(difficulty=value)), "difficulty")

    def test_unsupported_types_are_rejected(self) -> None:
        for value in ("essay", "code", None, 3):
            with self.subTest(type=value):
                self.assert_rejected(payload(numeric(type=value)), "unsupported type")

    def test_multiple_choice_answer_must_be_one_of_the_options(self) -> None:
        bad = choice()
        bad["answer"] = {"option_id": "Z"}
        self.assert_rejected(payload(bad), "one of the option ids")
        duplicate = choice()
        duplicate["options"] = [{"id": "A", "text": "x"}, {"id": "A", "text": "y"}]
        self.assert_rejected(payload(duplicate), "unique")
        single = choice()
        single["options"] = [{"id": "A", "text": "x"}]
        self.assert_rejected(payload(single), "options")

    def test_sources_must_belong_to_the_requested_documents(self) -> None:
        other = numeric(sources=[{"document_id": "e" * 32, "pages": [1]}])
        self.assert_rejected(payload(other), "not part of the request")
        self.assert_rejected(
            payload(numeric(sources=[{"document_id": DOCUMENT, "pages": [0]}])), "pages"
        )
        self.assert_rejected(
            payload(numeric(sources=[{"document_id": DOCUMENT, "pages": ["3"]}])),
            "pages",
        )

    def test_structure_and_limits(self) -> None:
        self.assert_rejected("not an object", "expected a JSON object")
        self.assert_rejected(
            {"schema_version": 2, "questions": [numeric()]}, "schema_version"
        )
        self.assert_rejected(payload(), "non-empty list")
        too_many = [numeric(f"q{i}") for i in range(REQUEST.count + 1)]
        self.assert_rejected(payload(*too_many), "only 3 were requested")
        self.assert_rejected(payload(numeric(prompt="x" * 5000)), "too long")
        self.assert_rejected(payload(numeric(prompt="  ")), "'prompt'")
        self.assert_rejected(payload(numeric(mode="adventure")), "does not match")

    def test_one_bad_question_rejects_the_whole_set(self) -> None:
        self.assert_rejected(
            payload(numeric("good"), numeric("bad", difficulty=9)), "question 2"
        )

    def test_the_fake_provider_output_passes_validation(self) -> None:
        raw = FakeGameMaster().generate_questions(REQUEST)
        generated = validate_generated_set(raw, REQUEST)
        self.assertEqual(len(generated.questions), REQUEST.count)
        self.assertTrue(all(q.sources[0].pages == () for q in generated.questions))


if __name__ == "__main__":
    unittest.main()

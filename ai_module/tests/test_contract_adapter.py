"""The pure adapter logic: difficulty plans, prompts, alignment, and page lookup.

Run from the repository root:
    GEMINI_API_KEY=test python -m unittest discover -s ai_module/tests -v
(The key is never used; importing the package builds a Gemini client object.)
"""

import os
import sys
import unittest
from pathlib import Path

os.environ.setdefault("GEMINI_API_KEY", "test-key-not-a-real-key")
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ai_module import contract_adapter as adapter  # noqa: E402
from ai_module.contract_adapter import ContractQuestion, PageIndex  # noqa: E402


def question(text="What is X?", difficulty=1, quote="a passage of the document", correct="b"):
    return ContractQuestion(
        difficulty=difficulty,
        question=text,
        options=[{"id": i, "text": f"option {i}"} for i in "abcd"],
        correct_option_id=correct,
        explanation="Because the document says so.",
        source_quote=quote,
    )


class PlanTests(unittest.TestCase):
    def test_even_spread_over_the_range(self):
        self.assertEqual(adapter.plan_difficulties(5, 1, 5), [1, 2, 3, 4, 5])
        self.assertEqual(adapter.plan_difficulties(3, 1, 5), [1, 3, 5])  # the backend's adventure
        self.assertEqual(adapter.plan_difficulties(2, 1, 5), [1, 5])
        self.assertEqual(adapter.plan_difficulties(1, 2, 4), [2])
        self.assertEqual(adapter.plan_difficulties(4, 2, 2), [2, 2, 2, 2])

    def test_every_planned_level_is_inside_the_range_and_non_decreasing(self):
        for count in range(1, 51):
            for low, high in [(1, 5), (2, 4), (3, 3), (1, 2)]:
                plan = adapter.plan_difficulties(count, low, high)
                self.assertEqual(len(plan), count)
                self.assertTrue(all(low <= level <= high for level in plan))
                self.assertEqual(plan, sorted(plan))

    def test_bad_ranges_are_rejected(self):
        for args in [(0, 1, 5), (3, 4, 2), (3, 0, 5), (3, 1, 6)]:
            with self.assertRaises(ValueError):
                adapter.plan_difficulties(*args)

    def test_large_requests_are_split_into_batches(self):
        chunks = adapter.split_plan(adapter.plan_difficulties(25, 1, 5))
        self.assertEqual([len(c) for c in chunks], [10, 10, 5])
        self.assertEqual(sum(chunks, []), adapter.plan_difficulties(25, 1, 5))


class PromptTests(unittest.TestCase):
    def test_prompt_lists_each_question_with_its_level_and_the_topic(self):
        prompt = adapter.questions_prompt("Perceptrons", [1, 3, 5])
        for line in ("Question 1: difficulty 1", "Question 2: difficulty 3", "Question 3: difficulty 5"):
            self.assertIn(line, prompt)
        self.assertIn("Topic focus: Perceptrons", prompt)
        self.assertIn("exactly 3 questions", prompt)
        self.assertIn("ONLY information retrieved from the document", prompt)
        self.assertIn("ids a, b, c, d", prompt)

    def test_retry_feedback_is_added_only_when_given(self):
        self.assertNotIn("previous answer", adapter.questions_prompt("t", [1]))
        self.assertIn("expected 3 questions, got 2", adapter.questions_prompt("t", [1, 2, 3], "expected 3 questions, got 2"))


class SchemaTests(unittest.TestCase):
    def test_difficulty_and_option_rules(self):
        for bad in (0, 6, -1):
            with self.assertRaises(ValueError):
                question(difficulty=bad)
        with self.assertRaises(ValueError):
            ContractQuestion(difficulty=1, question="q", options=[{"id": i, "text": "x"} for i in "aabc"],
                             correct_option_id="a", explanation="e", source_quote="s")  # fmt: skip

    def test_gemini_schema_has_no_answer_in_the_wrong_place_and_is_plain_json_schema(self):
        schema = adapter.ContractQuestionBatch.model_json_schema()
        self.assertIn("questions", schema["properties"])
        self.assertIn("correct_option_id", schema["$defs"]["ContractQuestion"]["properties"])


class AlignmentTests(unittest.TestCase):
    def test_matching_labels_pass_through(self):
        qs = [question("a", 1), question("b", 3), question("c", 5)]
        ordered, followed = adapter.align_to_plan(qs, [1, 3, 5])
        self.assertTrue(followed)
        self.assertEqual([q.question for q in ordered], ["a", "b", "c"])

    def test_reordered_labels_are_put_back_in_plan_order(self):
        qs = [question("c", 5), question("a", 1), question("b", 3)]
        ordered, followed = adapter.align_to_plan(qs, [1, 3, 5])
        self.assertTrue(followed)
        self.assertEqual([q.question for q in ordered], ["a", "b", "c"])

    def test_wrong_labels_fall_back_to_position(self):
        qs = [question("a", 2), question("b", 2), question("c", 2)]
        ordered, followed = adapter.align_to_plan(qs, [1, 3, 5])
        self.assertFalse(followed)
        self.assertEqual([q.question for q in ordered], ["a", "b", "c"])

    def test_wrong_count_is_an_error(self):
        with self.assertRaisesRegex(ValueError, "expected 3 questions, got 2"):
            adapter.align_to_plan([question(), question()], [1, 3, 5])


class PageTests(unittest.TestCase):
    PAGES = [
        "Title page of the lecture notes",
        "A perceptron is a linear classifier.\nThe decision boundary is a line in two dimensions, and the "
        "perceptron cannot solve XOR because XOR is not linearly separable.",
        "Backpropaga-\ntion revived interest in multi-layer networks in the 1980s, according to the history.",
        "The perceptron is a linear classifier. A perceptron is a linear classifier, as shown again here.",
    ]

    def setUp(self):
        self.index = PageIndex(self.PAGES)

    def test_a_quote_is_found_on_the_page_that_contains_it(self):
        self.assertEqual(self.index.find("the perceptron cannot solve XOR because XOR is not linearly separable"), [2])

    def test_punctuation_case_and_hyphenated_line_breaks_do_not_matter(self):
        self.assertEqual(self.index.find("BACKPROPAGATION revived interest in multi-layer networks"), [3])

    def test_a_quote_on_several_pages_returns_all_of_them(self):
        self.assertEqual(self.index.find("a perceptron is a linear classifier"), [2, 4])

    def test_unknown_paraphrased_and_too_short_quotes_return_nothing(self):
        self.assertEqual(self.index.find("this sentence is nowhere in the document at all"), [])
        self.assertEqual(self.index.find("A perceptron is a straight-line separator."), [])
        self.assertEqual(self.index.find("linear"), [])
        self.assertEqual(self.index.find(""), [])

    def test_sources_cite_pages_only_when_proven(self):
        indexes = {"d1": self.index, "d2": PageIndex(["nothing relevant"])}
        found = adapter.locate_sources("the perceptron cannot solve XOR because XOR is not linearly separable", indexes, ["d1", "d2"])
        self.assertEqual(found, [{"document_id": "d1", "pages": [2]}])

    def test_unfound_quote_cites_the_document_only_when_there_is_one(self):
        indexes = {"d1": self.index, "d2": PageIndex(["x"])}
        self.assertEqual(adapter.locate_sources("not in the pdf anywhere", indexes, ["d1"]), [{"document_id": "d1"}])
        self.assertEqual(adapter.locate_sources("not in the pdf anywhere", indexes, ["d1", "d2"]), [])

    def test_pages_are_never_invented_without_an_index(self):
        self.assertEqual(adapter.locate_sources("some quote that is long enough", {}, ["d1"]), [{"document_id": "d1"}])


class ExtractionNoiseTests(unittest.TestCase):
    """Cases taken from real PDF text extraction of a textbook chapter."""

    PAGES = [
        "Chapter intro. Nothing relevant on this page at all, just filler words here.",
        # Italic words lose their spaces, and a margin note is spliced into a word.
        "The architecture we introduce is called afeedforward networkbecause the computation "
        "proceeds iter feedforward atively from one layer of units to the next. The use of "
        "modern neural nets is often called deep learning.",
        # A math variable fused to the next word.
        "In the sigmoid or tanh functions, very high values ofz result in values of y that are "
        "saturated, i.e., extremely close to 1, and have derivatives very close to 0.",
        "Unrelated page about something else entirely, with different words altogether.",
    ]

    def setUp(self):
        self.index = PageIndex(self.PAGES)

    def test_fused_words_still_match(self):
        quote = "In the sigmoid or tanh functions, very high values of z result in values of y that are saturated"
        self.assertEqual(self.index.find(quote), [3])

    def test_noise_spliced_into_the_middle_is_tolerated_by_the_two_ends_check(self):
        quote = ("The architecture we introduce is called a feedforward network because the "
                 "computation proceeds iteratively from one layer of units to the next.")  # fmt: skip
        self.assertEqual(self.index.find(quote), [2])

    def test_a_long_quote_whose_ends_are_on_different_pages_is_not_located(self):
        head = "The architecture we introduce is called a feedforward network because"
        tail = "have derivatives very close to zero for these saturated values here"
        self.assertEqual(self.index.find(head + " something in between " + tail), [])

    def test_ends_in_the_wrong_order_or_far_apart_do_not_count(self):
        reversed_quote = ("from one layer of units to the next the use of modern neural nets is "
                          "often called deep learning the architecture we introduce is called a")  # fmt: skip
        self.assertEqual(self.index.find(reversed_quote), [])

    def test_a_paraphrase_is_not_located(self):
        self.assertEqual(self.index.find("Feedforward networks compute one layer after another, moving forward only."), [])


class BuildTests(unittest.TestCase):
    def test_question_matches_the_contract_shape_and_drops_extras(self):
        built = adapter.build_question(2, "practice", "Cells", 4, question("What?", 1, correct="c"), [{"document_id": "d"}])
        self.assertEqual(built["id"], "q-2")
        self.assertEqual(built["type"], "multiple_choice")
        self.assertEqual(built["difficulty"], 4)  # the planned level, not the model's label
        self.assertEqual(built["answer"], {"option_id": "c"})
        self.assertEqual([o["id"] for o in built["options"]], list("abcd"))
        self.assertNotIn("source_quote", built)
        self.assertNotIn("mnemonic", built)
        self.assertNotIn("xp_reward", built)

    def test_empty_sources_are_omitted_and_oversized_text_is_refused(self):
        self.assertNotIn("sources", adapter.build_question(1, "practice", "t", 1, question(), []))
        with self.assertRaisesRegex(ValueError, "too long"):
            adapter.build_question(1, "practice", "t", 1, question("x" * 4001), [])
        with self.assertRaisesRegex(ValueError, "empty"):
            adapter.build_question(1, "practice", "t", 1, question("  "), [])

    def test_duplicates_are_dropped_keeping_the_first(self):
        pairs = [(question("What is X?"), 1), (question("what is x"), 3), (question("Other?"), 5)]
        kept = adapter.drop_duplicates(pairs)
        self.assertEqual([(q.question, level) for q, level in kept], [("What is X?", 1), ("Other?", 5)])


if __name__ == "__main__":
    unittest.main()

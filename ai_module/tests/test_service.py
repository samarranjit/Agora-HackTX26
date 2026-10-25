"""The HTTP service, with Gemini replaced by a deterministic stand-in.

Run from the repository root:
    GEMINI_API_KEY=test python -m unittest discover -s ai_module/tests -v
"""

import io
import json
import os
import re
import sys
import tempfile
import unittest
from unittest import mock
from pathlib import Path

os.environ.setdefault("GEMINI_API_KEY", "test-key-not-a-real-key")
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from fastapi.testclient import TestClient  # noqa: E402
from pypdf import PdfWriter  # noqa: E402

from ai_module.contract_adapter import ContractQuestion, ContractQuestionBatch, PageIndex  # noqa: E402
from ai_module import service as service_module  # noqa: E402
from ai_module.service import (  # noqa: E402
    BUSY_MESSAGE,
    GeminiBusy,
    GeminiEngine,
    Settings,
    create_app,
    is_overloaded,
)

KEY = "test-rag-key"
DOC = "a" * 32
DOC2 = "b" * 32
AUTH = {"Authorization": f"Bearer {KEY}"}


def make_pdf(pages=2):
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=200)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


class FakeEngine:
    """Writes one valid question per requested level; records what it was asked."""

    def __init__(self):
        self.indexed = []
        self.deleted = []
        self.prompts = []
        self.stores_used = []
        self.fail_index = False
        self.fail_write = False
        self.busy = False  # every model reports being overloaded
        self.recitation_blocks = 0  # how many calls Gemini's recitation filter blocks first
        self.labels = None  # override Gemini's difficulty labels
        self.count_delta = 0  # return this many extra (or fewer) questions
        self.quote = "The intuition behind this important result relies on understanding perceptrons."

    def index(self, pdf_path, display_name):
        if self.fail_index:
            raise RuntimeError("boom: secret internal detail")
        self.indexed.append((Path(pdf_path).name, display_name))
        return f"fileSearchStores/store-{display_name[:4]}"

    def delete(self, store_name):
        self.deleted.append(store_name)

    def write_questions(self, prompt, store_names):
        if self.fail_write:
            raise RuntimeError("quota exhausted: secret internal detail")
        if self.busy:
            self.prompts.append(prompt)
            raise GeminiBusy('all models busy')
        if self.recitation_blocks:
            self.recitation_blocks -= 1
            self.prompts.append(prompt)
            raise RuntimeError("Request blocked due to copyright/recitation content. Please modify your input and retry.")
        self.prompts.append(prompt)
        self.stores_used.append(list(store_names))
        levels = [int(m) for m in re.findall(r"Question \d+: difficulty (\d)", prompt)]
        n = max(1, len(levels) + self.count_delta)
        levels = (levels + [levels[-1]] * n)[:n]
        labels = self.labels or levels
        return ContractQuestionBatch(
            questions=[
                ContractQuestion(
                    difficulty=labels[i % len(labels)],
                    question=f"Question text {len(self.prompts)}-{i}?",
                    options=[{"id": c, "text": f"option {c}"} for c in "abcd"],
                    correct_option_id="abcd"[i % 4],
                    explanation="The document states this.",
                    source_quote=self.quote,
                )
                for i in range(n)
            ]
        )


def check_contract(test, payload, request):
    """An independent restatement of the backend's validation rules (contract v1)."""
    test.assertEqual(payload["schema_version"], 1)
    questions = payload["questions"]
    test.assertTrue(1 <= len(questions) <= request["count"])
    ids = [q["id"] for q in questions]
    test.assertEqual(len(ids), len(set(ids)))
    for q in questions:
        test.assertIn(q["type"], {"numeric", "multiple_choice"})
        test.assertEqual(q["mode"], request["mode"])
        test.assertIs(type(q["difficulty"]), int)
        test.assertTrue(1 <= q["difficulty"] <= 5)
        for field in ("prompt", "explanation"):
            test.assertTrue(q[field].strip() and len(q[field]) <= 4000)
        options = q["options"]
        test.assertTrue(2 <= len(options) <= 6)
        option_ids = [o["id"] for o in options]
        test.assertEqual(len(set(option_ids)), len(option_ids))
        test.assertTrue(all(re.fullmatch(r"[A-Za-z0-9_-]{1,32}", i) for i in option_ids))
        test.assertIn(q["answer"]["option_id"], option_ids)
        for source in q.get("sources", []):
            test.assertIn(source["document_id"], request["document_ids"])
            test.assertTrue(all(isinstance(p, int) and p >= 1 for p in source.get("pages", [])))
    for key in payload["generation"]:
        test.assertIn(key, {"provider_question_set_id", "model", "prompt_version", "pipeline_version", "generated_at"})


class ServiceTestCase(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.data_dir = Path(temp.name)
        self.engine = FakeEngine()
        self.client = self.start()

    def start(self, engine=None, api_key=KEY, allow_no_auth=False):
        settings = Settings(data_dir=self.data_dir, api_key=api_key, allow_no_auth=allow_no_auth)
        app = create_app(engine or self.engine, settings)
        client = TestClient(app, raise_server_exceptions=False)
        self.addCleanup(client.close)
        return client

    def ingest(self, document_id=DOC, data=None):
        return self.client.post(
            "/v1/documents", headers=AUTH,
            files={"file": ("notes.pdf", data if data is not None else make_pdf(), "application/pdf")},
            data={"document_id": document_id},
        )  # fmt: skip

    def request(self, **overrides):
        body = {"contract_version": 1, "question_set_id": "s" * 32, "document_ids": [DOC],
                "topic": "Perceptrons", "mode": "practice", "count": 5,
                "difficulty_min": 1, "difficulty_max": 5}  # fmt: skip
        body.update(overrides)
        return body

    def generate(self, **overrides):
        return self.client.post("/v1/question-sets", headers=AUTH, json=self.request(**overrides))


class AuthTests(ServiceTestCase):
    def test_requests_without_the_right_key_are_refused_in_the_contract_error_shape(self):
        for headers in ({}, {"Authorization": "Bearer wrong"}, {"Authorization": KEY}):
            response = self.client.post("/v1/question-sets", headers=headers, json=self.request())
            self.assertEqual(response.status_code, 401)
            self.assertEqual(response.json(), {"error": "Missing or invalid API key."})
        self.assertEqual(self.client.get("/healthz").status_code, 200)

    def test_the_service_refuses_to_start_without_a_key_unless_explicitly_allowed(self):
        with self.assertRaisesRegex(RuntimeError, "RAG_API_KEY"):
            create_app(self.engine, Settings(data_dir=self.data_dir, api_key=None))
        open_client = self.start(api_key=None, allow_no_auth=True)
        self.assertEqual(open_client.post("/v1/documents", files={"file": ("a.pdf", make_pdf())}, data={"document_id": DOC}).status_code, 200)


class IngestTests(ServiceTestCase):
    def test_a_pdf_is_indexed_once_under_its_document_id(self):
        self.assertEqual(self.ingest().json(), {"status": "ready"})
        self.assertEqual(self.engine.indexed, [(f"{DOC}.pdf", DOC)])
        self.assertEqual(self.ingest().json(), {"status": "ready"})
        self.assertEqual(len(self.engine.indexed), 1, "a repeated ingest must not index twice")

    def test_invalid_files_are_reported_as_failed_with_a_clear_reason(self):
        cases = {b"": "empty", b"hello, not a pdf": "not a PDF", b"%PDF-1.4 garbage": "could not be read"}
        for data, fragment in cases.items():
            body = self.ingest(data=data).json()
            self.assertEqual(body["status"], "failed", data)
            self.assertIn(fragment, body["error"])
        self.assertEqual(self.engine.indexed, [])
        self.assertEqual(list((self.data_dir / "pdfs").iterdir()), [])

    def test_document_ids_cannot_escape_the_data_folder(self):
        for bad in ("../evil", "a/b", "x" * 65, "", "has space"):
            response = self.ingest(document_id=bad)
            self.assertIn(response.status_code, (404, 405, 422), bad)
        self.assertEqual(self.engine.indexed, [])
        self.assertEqual([p.name for p in self.data_dir.rglob("*.pdf")], [])

    def test_an_indexing_failure_hides_internals_and_leaves_nothing_behind(self):
        self.engine.fail_index = True
        body = self.ingest().json()
        self.assertEqual(body["status"], "failed")
        self.assertNotIn("secret", body["error"])
        self.assertEqual(list((self.data_dir / "pdfs").iterdir()), [])
        self.engine.fail_index = False
        self.assertEqual(self.ingest().json(), {"status": "ready"})

    def test_indexed_documents_survive_a_service_restart(self):
        self.ingest()
        restarted = self.start(FakeEngine())
        response = restarted.post("/v1/question-sets", headers=AUTH, json=self.request(count=2))
        self.assertEqual(response.status_code, 200, response.text)

    def test_deleting_a_document_removes_its_store_file_and_registration(self):
        self.ingest()
        self.assertEqual(self.client.delete(f"/v1/documents/{DOC}", headers=AUTH).status_code, 204)
        self.assertEqual(self.engine.deleted, [f"fileSearchStores/store-{DOC[:4]}"])
        self.assertFalse((self.data_dir / "pdfs" / f"{DOC}.pdf").exists())
        self.assertEqual(self.client.delete(f"/v1/documents/{DOC}", headers=AUTH).status_code, 404)
        self.assertEqual(self.generate().status_code, 404)


class GenerationTests(ServiceTestCase):
    def setUp(self):
        super().setUp()
        self.ingest()

    def test_practice_set_meets_the_contract_and_covers_each_level(self):
        request = self.request(count=5)
        response = self.generate(count=5)
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        check_contract(self, payload, request)
        self.assertEqual([q["difficulty"] for q in payload["questions"]], [1, 2, 3, 4, 5])
        self.assertEqual(payload["generation"]["provider_question_set_id"], request["question_set_id"])
        self.assertTrue(all(q["type"] == "multiple_choice" for q in payload["questions"]))

    def test_the_adventure_set_has_exactly_difficulties_1_3_and_5(self):
        request = self.request(mode="adventure", count=3)
        payload = self.generate(mode="adventure", count=3).json()
        check_contract(self, payload, request)
        self.assertEqual([q["difficulty"] for q in payload["questions"]], [1, 3, 5])

    def test_the_requested_topic_range_and_store_reach_gemini(self):
        self.generate(topic="Backpropagation", count=2, difficulty_min=2, difficulty_max=4)
        prompt = self.engine.prompts[0]
        self.assertIn("Topic focus: Backpropagation", prompt)
        self.assertIn("Question 1: difficulty 2", prompt)
        self.assertIn("Question 2: difficulty 4", prompt)
        self.assertEqual(self.engine.stores_used, [[f"fileSearchStores/store-{DOC[:4]}"]])

    def test_large_requests_are_split_into_parallel_batches(self):
        payload = self.generate(count=25).json()
        self.assertEqual(len(self.engine.prompts), 3)
        self.assertEqual(len(payload["questions"]), 25)
        levels = [q["difficulty"] for q in payload["questions"]]
        self.assertEqual(levels, sorted(levels))

    def test_a_single_document_is_cited_without_pages_when_no_quote_matches(self):
        question = self.generate(count=1).json()["questions"][0]
        self.assertEqual(question["sources"], [{"document_id": DOC}])

    def test_pages_are_included_only_when_the_quote_is_found_in_the_pdf(self):
        service = self.client.app.state.service
        service.registry.page_index = lambda d: PageIndex(["cover", self.engine.quote + " More text.", "end"])
        question = self.generate(count=1).json()["questions"][0]
        self.assertEqual(question["sources"], [{"document_id": DOC, "pages": [2]}])

    def test_several_documents_are_all_searched_and_unmatched_quotes_claim_no_source(self):
        self.ingest(DOC2)
        payload = self.generate(document_ids=[DOC, DOC2], count=2).json()
        self.assertEqual(sorted(self.engine.stores_used[0]), sorted([f"fileSearchStores/store-{DOC[:4]}", f"fileSearchStores/store-{DOC2[:4]}"]))
        self.assertTrue(all("sources" not in q for q in payload["questions"]))

    def test_wrong_difficulty_labels_do_not_change_the_planned_levels(self):
        self.engine.labels = [2]
        payload = self.generate(mode="adventure", count=3).json()
        self.assertEqual([q["difficulty"] for q in payload["questions"]], [1, 3, 5])

    def test_a_wrong_question_count_is_retried_then_reported(self):
        self.engine.count_delta = -1
        response = self.generate(count=4)
        self.assertEqual(response.status_code, 502)
        self.assertIn("did not return 4 questions", response.json()["error"])
        self.assertEqual(len(self.engine.prompts), 3)
        self.assertIn("expected 4 questions, got 3", self.engine.prompts[1])

    def test_gemini_failures_become_a_safe_error(self):
        self.engine.fail_write = True
        response = self.generate()
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("secret", response.text)
        self.assertEqual(set(response.json()), {"error"})

    def test_a_recitation_block_is_retried_asking_for_own_words(self):
        self.engine.recitation_blocks = 1
        response = self.generate()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(self.engine.prompts), 2)
        self.assertNotIn("own words", self.engine.prompts[0])
        self.assertIn("in your own words", self.engine.prompts[1])

    def test_repeated_recitation_blocks_end_in_a_safe_error(self):
        self.engine.recitation_blocks = 10
        response = self.generate()
        self.assertEqual(response.status_code, 502)
        self.assertEqual(set(response.json()), {"error"})
        self.assertNotIn("recitation", response.text)

    def test_when_every_model_is_busy_it_waits_retries_then_says_so_plainly(self):
        self.engine.busy = True
        with mock.patch.object(service_module, "OVERLOAD_PAUSE_SECONDS", 0):
            response = self.generate()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"error": BUSY_MESSAGE})
        self.assertEqual(len(self.engine.prompts), service_module.BUSY_ROUNDS)

    def test_the_response_names_the_model_that_actually_wrote_the_questions(self):
        self.engine.last_model = "the-fallback-model"
        self.assertEqual(self.generate().json()["generation"]["model"], "the-fallback-model")

    def test_unknown_documents_and_bad_requests_use_the_error_shape(self):
        unknown = self.generate(document_ids=["c" * 32])
        self.assertEqual(unknown.status_code, 404)
        self.assertIn("has not been ingested", unknown.json()["error"])
        for overrides in ({"count": 0}, {"count": 51}, {"mode": "boss"}, {"topic": ""},
                          {"difficulty_min": 4, "difficulty_max": 2}, {"contract_version": 2},
                          {"document_ids": []}):  # fmt: skip
            response = self.generate(**overrides)
            self.assertEqual(response.status_code, 422, overrides)
            self.assertEqual(set(response.json()), {"error"}, overrides)

    def test_unknown_request_fields_are_ignored_for_forward_compatibility(self):
        self.assertEqual(self.generate(future_field="x").status_code, 200)

    def test_answers_are_present_for_the_backend_but_no_unplanned_fields_leak(self):
        question = self.generate(count=1).json()["questions"][0]
        self.assertEqual(
            set(question), {"id", "type", "mode", "topic", "prompt", "options", "answer", "explanation", "difficulty", "sources"}
        )


if __name__ == "__main__":
    unittest.main()


class OverloadError(Exception):
    def __init__(self, message="high demand", status_code=429):
        super().__init__(message)
        self.status_code = status_code


class FakeGeminiClient:
    """Stands in for ai_module.gemini.client: each model either fails or answers."""

    def __init__(self, behaviour):
        self.behaviour = behaviour  # model -> exception to raise, or None to answer
        self.calls = []
        self.interactions = self

    def create(self, *, model, **options):
        self.calls.append(model)
        self.options = options
        problem = self.behaviour.get(model)
        if problem is not None:
            raise problem
        question = {
            "difficulty": 1, "question": "Why?", "options": [{"id": c, "text": c} for c in "abcd"],
            "correct_option_id": "a", "explanation": "Because.", "source_quote": "a passage",
        }
        return mock.Mock(output_text=json.dumps({"questions": [question]}))


class ModelFallbackTests(unittest.TestCase):
    MODELS = ("light", "medium", "other")

    def run_engine(self, behaviour):
        from ai_module import gemini

        client = FakeGeminiClient(behaviour)
        engine = GeminiEngine()
        with mock.patch.object(gemini, "client", client), mock.patch.object(service_module, "MODELS", self.MODELS):
            try:
                return engine, client, engine.write_questions("prompt", ["store"]), None
            except Exception as exc:  # the caller inspects what was raised
                return engine, client, None, exc

    def test_the_lightest_model_is_used_when_it_works(self):
        engine, client, batch, error = self.run_engine({})
        self.assertIsNone(error)
        self.assertEqual(client.calls, ["light"])
        self.assertEqual(engine.last_model, "light")

    def test_an_overloaded_model_hands_over_to_the_next_one(self):
        engine, client, batch, error = self.run_engine({"light": OverloadError()})
        self.assertIsNone(error)
        self.assertEqual(client.calls, ["light", "medium"])
        self.assertEqual(engine.last_model, "medium")
        self.assertEqual(len(batch.questions), 1)

    def test_a_retired_model_is_skipped_too(self):
        gone = OverloadError("This model models/x is no longer available to new users.", 404)
        _, client, _, error = self.run_engine({"light": gone})
        self.assertIsNone(error)
        self.assertEqual(client.calls, ["light", "medium"])

    def test_a_request_problem_is_not_blamed_on_the_model(self):
        _, client, _, error = self.run_engine({"light": ValueError("the schema is wrong")})
        self.assertIsInstance(error, ValueError)
        self.assertEqual(client.calls, ["light"])

    def test_when_every_model_is_overloaded_it_reports_busy(self):
        behaviour = {m: OverloadError() for m in self.MODELS}
        _, client, _, error = self.run_engine(behaviour)
        self.assertIsInstance(error, GeminiBusy)
        self.assertEqual(client.calls, list(self.MODELS))

    def test_every_call_has_a_time_limit(self):
        _, client, _, _ = self.run_engine({})
        self.assertEqual(client.options["timeout"], service_module.CALL_TIMEOUT_SECONDS)

    def test_a_call_that_hangs_counts_as_an_overloaded_model(self):
        class ReadTimeout(Exception):
            pass

        engine, client, _, error = self.run_engine({"light": ReadTimeout("the read operation timed out")})
        self.assertIsNone(error)
        self.assertEqual(client.calls, ["light", "medium"])
        self.assertEqual(engine.last_model, "medium")

    def test_a_model_that_just_failed_is_rested_so_the_next_request_does_not_wait_on_it(self):
        from ai_module import gemini

        client = FakeGeminiClient({"light": OverloadError()})
        engine = GeminiEngine()
        with mock.patch.object(gemini, "client", client), mock.patch.object(service_module, "MODELS", self.MODELS):
            engine.write_questions("prompt", ["store"])
            engine.write_questions("prompt", ["store"])
        self.assertEqual(client.calls, ["light", "medium", "medium"], "the second request skipped the resting model")

    def test_a_resting_model_returns_after_its_cooldown(self):
        from ai_module import gemini

        client = FakeGeminiClient({"light": OverloadError()})
        engine = GeminiEngine()
        with mock.patch.object(gemini, "client", client), mock.patch.object(service_module, "MODELS", self.MODELS):
            engine.write_questions("prompt", ["store"])
            engine._resting["light"] = 0  # the cooldown has passed
            client.behaviour = {}
            engine.write_questions("prompt", ["store"])
        self.assertEqual(client.calls[-1], "light")

    def test_rate_limits_and_overload_are_not_retried_by_the_sdk(self):
        from ai_module import config

        self.assertNotIn(429, config.SDK_RETRY_STATUS_CODES)
        self.assertNotIn(503, config.SDK_RETRY_STATUS_CODES)

    def test_which_failures_count_as_overload(self):
        for exc in (OverloadError(), OverloadError("boom", 503), OverloadError("boom", 500),
                    RuntimeError("gemini-3.5-flash-lite is currently experiencing high demand"),
                    RuntimeError("503 UNAVAILABLE"), RuntimeError("RESOURCE_EXHAUSTED"),
                    OverloadError("Model 'gemini-bogus-9' not found. Please verify the model name.", 404)):
            self.assertTrue(is_overloaded(exc), exc)
        for exc in (ValueError("bad schema"), OverloadError("blocked", 400),
                    RuntimeError("Request blocked due to copyright/recitation content")):
            self.assertFalse(is_overloaded(exc), exc)

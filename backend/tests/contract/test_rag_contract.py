"""The HTTP contract with the game master: what is sent and how replies are handled."""

import copy
import json
import unittest
from typing import Any

import httpx
from rag_samples import DOCUMENT, REQUEST, numeric, payload

from learning_game_backend.rag.http_client import HttpGameMaster
from learning_game_backend.rag.protocol import ProviderError, ProviderTimeout
from learning_game_backend.rag.validation import (
    validate_generated_set,
)


class HttpAdapterTests(unittest.TestCase):
    def provider(
        self, handler: Any, api_key: str | None = "sk-secret"
    ) -> HttpGameMaster:
        return HttpGameMaster(
            "http://gm.test/", api_key, 5, transport=httpx.MockTransport(handler)
        )

    def test_generation_request_and_response(self) -> None:
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(200, json=payload(numeric()))

        raw = self.provider(handler).generate_questions(REQUEST)
        generated = validate_generated_set(raw, REQUEST)
        self.assertEqual(generated.questions[0].source_question_id, "q1")
        request = seen[0]
        self.assertEqual(str(request.url), "http://gm.test/v1/question-sets")
        self.assertEqual(request.headers["authorization"], "Bearer sk-secret")
        body = json.loads(request.content)
        self.assertEqual(body["document_ids"], [DOCUMENT])
        self.assertEqual((body["mode"], body["count"]), ("practice", 3))

    def test_ingestion_uploads_the_pdf(self) -> None:
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(200, json={"status": "ready"})

        self.provider(handler).ingest_document(DOCUMENT, "notes.pdf", b"%PDF-data")
        self.assertIn(b"%PDF-data", seen[0].content)
        self.assertIn(DOCUMENT.encode(), seen[0].content)

    def test_ingestion_failures_are_reported(self) -> None:
        def failed(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200, json={"status": "failed", "error": "Scanned PDF."}
            )

        with self.assertRaisesRegex(ProviderError, "Scanned PDF"):
            self.provider(failed).ingest_document(DOCUMENT, "a.pdf", b"x")

        def unexpected(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"status": "queued"})

        with self.assertRaisesRegex(ProviderError, "unexpected status"):
            self.provider(unexpected).ingest_document(DOCUMENT, "a.pdf", b"x")

    def test_timeouts_have_their_own_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ReadTimeout("slow", request=request)

        with self.assertRaisesRegex(ProviderTimeout, "did not respond within 5"):
            self.provider(handler).generate_questions(REQUEST)

    def test_connection_and_http_errors_do_not_leak_details(self) -> None:
        def refuse(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connect to 10.0.0.5 failed", request=request)

        with self.assertRaises(ProviderError) as refused:
            self.provider(refuse).generate_questions(REQUEST)
        self.assertNotIn("10.0.0.5", str(refused.exception))

        def broken(request: httpx.Request) -> httpx.Response:
            return httpx.Response(500, text="Traceback: sk-secret")

        with self.assertRaisesRegex(ProviderError, "HTTP 500") as error:
            self.provider(broken).generate_questions(REQUEST)
        self.assertNotIn("sk-secret", str(error.exception))

        def not_json(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, text="<html>")

        with self.assertRaisesRegex(ProviderError, "invalid JSON"):
            self.provider(not_json).generate_questions(REQUEST)

    def test_requests_work_without_an_api_key(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            self.assertNotIn("authorization", request.headers)
            return httpx.Response(200, json=payload(copy.deepcopy(numeric())))

        self.provider(handler, api_key=None).generate_questions(REQUEST)


if __name__ == "__main__":
    unittest.main()

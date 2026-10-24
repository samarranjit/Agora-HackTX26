"""Shared setup for the API tests: apps, fake providers, PDFs, and a client wrapper."""

import io
import re
import tempfile
import unittest
import uuid
from dataclasses import replace
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from learning_game_engine.rules import DEFAULT_RULES, Rules
from pypdf import PdfWriter

from learning_game_backend.api.app import create_app
from learning_game_backend.config import GameMasterMode, Settings
from learning_game_backend.rag.fake_provider import FakeGameMaster
from learning_game_backend.rag.protocol import ProviderError
from learning_game_backend.rag.schemas import GenerationRequest

PASSWORD = "correct horse battery"


def make_pdf(pages: int = 1) -> bytes:
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=200)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def make_encrypted_pdf() -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer.encrypt("secret")
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def solve(prompt: str) -> str:
    """Answer the fake provider's 'What is A × B?' questions."""
    match = re.search(r"(\d+) × (\d+)", prompt)
    assert match, prompt
    return str(int(match.group(1)) * int(match.group(2)))


class ScriptedGameMaster:
    """A provider whose output and failures are controlled by the test."""

    name = "scripted"

    def __init__(
        self,
        payload: object | None = None,
        ingest_error: ProviderError | None = None,
        generate_error: ProviderError | None = None,
    ) -> None:
        self.payload = payload
        self.ingest_error = ingest_error
        self.generate_error = generate_error
        self.requests: list[GenerationRequest] = []
        self._fake = FakeGameMaster()

    def ingest_document(self, document_id: str, filename: str, pdf: bytes) -> None:
        if self.ingest_error:
            raise self.ingest_error

    def generate_questions(self, request: GenerationRequest) -> object:
        self.requests.append(request)
        if self.generate_error:
            raise self.generate_error
        if self.payload is not None:
            return self.payload
        return self._fake.generate_questions(request)


class ApiTestCase(unittest.TestCase):
    rules: Rules = DEFAULT_RULES
    settings_overrides: dict[str, Any] = {}

    def setUp(self) -> None:
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        self.data_dir = Path(temp_dir.name)
        self.settings = replace(
            Settings(data_dir=self.data_dir, game_master_mode=GameMasterMode.FAKE),
            **self.settings_overrides,
        )
        self.provider: Any = FakeGameMaster()
        self.client = self.start_app()

    def start_app(self, provider: Any | None = None) -> TestClient:
        """Build (or rebuild, simulating a restart) the app on the same data."""
        if provider is not None:
            self.provider = provider
        app = create_app(self.settings, self.provider, self.rules)
        # Report unexpected server errors as HTTP 500 like a real deployment.
        client = TestClient(app, raise_server_exceptions=False)
        self.addCleanup(client.close)
        return client

    # --- Requests ---

    def register(self, username: str = "ada") -> dict[str, str]:
        response = self.client.post(
            "/api/auth/register", json={"username": username, "password": PASSWORD}
        )
        self.assertEqual(response.status_code, 201, response.text)
        return self.login(username)

    def login(
        self, username: str = "ada", client: TestClient | None = None
    ) -> dict[str, str]:
        response = (client or self.client).post(
            "/api/auth/login", json={"username": username, "password": PASSWORD}
        )
        self.assertEqual(response.status_code, 200, response.text)
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    def key(self) -> dict[str, str]:
        return {"Idempotency-Key": uuid.uuid4().hex}

    def upload(self, headers: dict[str, str], pdf: bytes | None = None) -> str:
        response = self.client.post(
            "/api/documents",
            headers=headers,
            files={"file": ("notes.pdf", pdf or make_pdf(3), "application/pdf")},
        )
        self.assertEqual(response.status_code, 202, response.text)
        document_id: str = response.json()["document_id"]
        return document_id

    def question_set(
        self,
        headers: dict[str, str],
        mode: str,
        count: int,
        document_id: str | None = None,
    ) -> str:
        document_id = document_id or self.upload(headers)
        response = self.client.post(
            "/api/question-sets",
            headers=headers,
            json={
                "document_ids": [document_id],
                "mode": mode,
                "topic": "Multiplication",
                "count": count,
            },
        )
        self.assertEqual(response.status_code, 202, response.text)
        set_id: str = response.json()["question_set_id"]
        return set_id

    def answer(
        self,
        headers: dict[str, str],
        attempt: dict[str, Any],
        answer: str | None = None,
        key: str | None = None,
    ) -> Any:
        return self.client.post(
            f"/api/attempts/{attempt['attempt_id']}/answer",
            headers={**headers, "Idempotency-Key": key or uuid.uuid4().hex},
            json={"answer": answer if answer is not None else solve(attempt["prompt"])},
        )

    def practice(self, headers: dict[str, str], correct: bool = True) -> dict[str, Any]:
        """Fetch the next practice question and answer it. Returns the response body."""
        created = self.client.post("/api/practice/attempts", headers=headers, json={})
        self.assertIn(created.status_code, (200, 201), created.text)
        attempt = created.json()["attempt"]
        response = self.answer(headers, attempt, None if correct else "-1")
        self.assertEqual(response.status_code, 200, response.text)
        body: dict[str, Any] = response.json()
        return body

    def unlock_adventure(self, headers: dict[str, str]) -> None:
        """Five practice answers of difficulty 1-5 earn exactly 100 XP."""
        self.question_set(headers, "practice", 5)
        for _ in range(5):
            self.practice(headers)

    def state(self, headers: dict[str, str]) -> dict[str, Any]:
        response = self.client.get("/api/me/state", headers=headers)
        self.assertEqual(response.status_code, 200, response.text)
        body: dict[str, Any] = response.json()
        return body

    def start_battle(self, headers: dict[str, str]) -> Any:
        return self.client.post(
            "/api/adventure/battles", headers={**headers, **self.key()}, json={}
        )

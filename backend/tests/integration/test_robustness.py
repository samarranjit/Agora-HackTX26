"""Failure paths: oversized uploads, storage errors, and half-finished registrations."""

import sqlite3
from collections.abc import Iterator
from contextlib import closing
from dataclasses import replace
from unittest import mock

from api_helpers import PASSWORD, ApiTestCase, make_pdf

from learning_game_backend.application.game_service import GameService


class UploadLimitTests(ApiTestCase):
    def test_oversized_upload_is_refused_from_its_declared_length(self) -> None:
        self.settings = replace(self.settings, max_upload_bytes=1000)
        self.client = self.start_app()
        headers = self.register()
        big = b"%PDF-1.7\n" + b"0" * 200_000
        with mock.patch(
            "learning_game_backend.application.game_service.check_pdf"
        ) as check:
            response = self.client.post(
                "/api/documents", headers=headers, files={"file": ("big.pdf", big)}
            )
        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.json()["error"]["code"], "too_large")
        check.assert_not_called()  # refused before the body was parsed

    def test_upload_without_a_content_length_is_refused(self) -> None:
        headers = self.register()

        def chunks() -> Iterator[bytes]:
            yield make_pdf()

        response = self.client.post(
            "/api/documents",
            headers={**headers, "Content-Type": "multipart/form-data; boundary=x"},
            content=chunks(),
        )
        self.assertEqual(response.status_code, 411)
        self.assertEqual(response.json()["error"]["code"], "length_required")

    def test_normal_uploads_still_work_near_the_limit(self) -> None:
        pdf = make_pdf(2)
        self.settings = replace(self.settings, max_upload_bytes=len(pdf))
        self.client = self.start_app()
        headers = self.register()
        self.upload(headers, pdf)


class GenerationStorageFailureTests(ApiTestCase):
    def test_a_storage_error_marks_the_set_failed_instead_of_stuck(self) -> None:
        headers = self.register()
        document_id = self.upload(headers)
        with mock.patch.object(
            GameService,
            "_store_questions",
            side_effect=sqlite3.OperationalError("disk I/O error"),
        ):
            response = self.client.post(
                "/api/question-sets",
                headers=headers,
                json={
                    "document_ids": [document_id],
                    "mode": "practice",
                    "topic": "x",
                    "count": 3,
                },
            )
        set_id = response.json()["question_set_id"]
        body = self.client.get(f"/api/question-sets/{set_id}", headers=headers).json()
        self.assertEqual(body["status"], "failed")
        self.assertEqual(body["error"], "Internal error.")
        self.assertNotIn("disk", body["error"])
        self.assertEqual(body["questions"], [])


class RegistrationAtomicityTests(ApiTestCase):
    def test_a_failure_after_creating_the_account_undoes_it(self) -> None:
        with mock.patch.object(
            GameService, "create_player", side_effect=RuntimeError("boom")
        ):
            failed = self.client.post(
                "/api/auth/register", json={"username": "ada", "password": PASSWORD}
            )
        self.assertEqual(failed.status_code, 500)
        with closing(sqlite3.connect(self.settings.database_path)) as conn:
            users = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        self.assertEqual(users, 0)
        # The username is free again and the account works normally.
        headers = self.register("ada")
        self.assertEqual(self.state(headers)["xp"], 0)

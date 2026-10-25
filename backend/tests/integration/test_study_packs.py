"""One PDF upload that becomes playable practice and adventure questions."""

import sqlite3
from contextlib import closing
from dataclasses import replace
from typing import Any
from unittest import mock

from api_helpers import ApiTestCase, ScriptedGameMaster, make_encrypted_pdf, make_pdf

from learning_game_backend.application.game_service import (
    RESTART_ERROR,
    GameService,
)
from learning_game_backend.auth.service import Account
from learning_game_backend.rag.protocol import ProviderError

PACK_KEYS = {
    "document_id", "name", "topic", "status", "stage", "error",
    "practice", "adventure", "created_at", "updated_at",
}  # fmt: skip
SET_KEYS = {"question_set_id", "mode", "status", "error", "question_count"}


class StudyPackTestCase(ApiTestCase):
    def submit(
        self, headers: dict[str, str], pdf: bytes | None = None, **form: Any
    ) -> Any:
        return self.client.post(
            "/api/study-packs",
            headers=headers,
            files={"file": ("lecture.pdf", pdf or make_pdf(3), "application/pdf")},
            data=form,
        )

    def pack(self, headers: dict[str, str], document_id: str) -> dict[str, Any]:
        response = self.client.get(f"/api/study-packs/{document_id}", headers=headers)
        self.assertEqual(response.status_code, 200, response.text)
        body: dict[str, Any] = response.json()
        return body

    def account(self, username: str = "ada") -> Account:
        with closing(sqlite3.connect(self.settings.database_path)) as conn:
            (user_id,) = conn.execute(
                "SELECT id FROM users WHERE username = ?", (username,)
            ).fetchone()
        return Account(user_id=user_id, username=username)

    def service(self) -> GameService:
        service: GameService = self.client.app.state.service  # type: ignore[attr-defined]
        return service


class HappyPathTests(StudyPackTestCase):
    def test_one_upload_produces_both_question_sets(self) -> None:
        headers = self.register()
        response = self.submit(headers)
        self.assertEqual(response.status_code, 202, response.text)
        self.assertEqual(set(response.json()), PACK_KEYS)

        pack = self.pack(headers, response.json()["document_id"])
        self.assertEqual(
            (pack["status"], pack["stage"], pack["error"]), ("ready", "done", None)
        )
        self.assertEqual(pack["name"], "lecture.pdf")
        self.assertEqual(set(pack["practice"]), SET_KEYS)
        self.assertEqual(
            (pack["practice"]["mode"], pack["practice"]["question_count"]),
            ("practice", 10),
        )
        self.assertEqual(
            (pack["adventure"]["mode"], pack["adventure"]["question_count"]),
            ("adventure", 3),
        )
        for part in ("practice", "adventure"):
            self.assertEqual(pack[part]["status"], "ready")

    def test_the_questions_are_playable_all_the_way_to_victory(self) -> None:
        headers = self.register()
        self.submit(
            headers
        )  # nothing else: no separate upload, generate, or poll steps
        for _ in range(10):
            if self.state(headers)["adventure_unlocked"]:
                break
            self.practice(headers)
        self.assertTrue(self.state(headers)["adventure_unlocked"])
        outcomes = []
        for _ in range(3):
            started = self.start_battle(headers)
            self.assertEqual(started.status_code, 200, started.text)
            outcomes.append(
                self.answer(headers, started.json()["attempt"]).json()["encounter"][
                    "outcome"
                ]
            )
        self.assertEqual(outcomes, ["won", "won", "won"])
        self.assertTrue(self.state(headers)["adventure_completed"])

    def test_the_adventure_set_has_exactly_the_levels_the_villains_need(self) -> None:
        headers = self.register()
        document_id = self.submit(headers).json()["document_id"]
        adventure_id = self.pack(headers, document_id)["adventure"]["question_set_id"]
        questions = self.client.get(
            f"/api/question-sets/{adventure_id}", headers=headers
        ).json()["questions"]
        self.assertEqual([q["difficulty"] for q in questions], [1, 3, 5])

    def test_the_sets_can_be_used_to_scope_play_to_this_pdf(self) -> None:
        headers = self.register()
        first = self.pack(headers, self.submit(headers).json()["document_id"])
        self.submit(headers)
        attempt = self.client.post(
            "/api/practice/attempts",
            headers=headers,
            json={"question_set_id": first["practice"]["question_set_id"]},
        )
        self.assertEqual(attempt.status_code, 201, attempt.text)

    def test_the_topic_and_practice_count_reach_the_game_master(self) -> None:
        provider = ScriptedGameMaster()
        self.client = self.start_app(provider)
        headers = self.register()
        self.submit(headers, topic="  Backpropagation  ", practice_count=7)
        by_mode = {r.mode.value: r for r in provider.requests}
        self.assertEqual(by_mode["practice"].topic, "Backpropagation")
        self.assertEqual(
            (
                by_mode["practice"].count,
                by_mode["practice"].difficulty_min,
                by_mode["practice"].difficulty_max,
            ),
            (7, 1, 5),
        )
        self.assertEqual(
            (
                by_mode["adventure"].count,
                by_mode["adventure"].difficulty_min,
                by_mode["adventure"].difficulty_max,
            ),
            (3, 1, 5),
        )

    def test_a_blank_topic_means_the_whole_document(self) -> None:
        provider = ScriptedGameMaster()
        self.client = self.start_app(provider)
        headers = self.register()
        self.submit(headers, topic="   ")
        self.assertEqual(
            {r.topic for r in provider.requests}, {"The main ideas of the document"}
        )

    def test_progress_is_visible_before_the_background_work_runs(self) -> None:
        headers = self.register()
        service = self.service()
        created = service.create_study_pack(
            self.account(), "lecture.pdf", make_pdf(2), "Cells", 5
        )
        self.assertEqual((created["status"], created["stage"]), ("pending", "indexing"))
        self.assertIsNone(created["practice"])
        service.run_study_pack(created["document_id"])
        done = self.pack(headers, created["document_id"])
        self.assertEqual((done["status"], done["stage"]), ("ready", "done"))

    def test_running_a_pack_twice_does_not_write_questions_twice(self) -> None:
        provider = ScriptedGameMaster()
        self.client = self.start_app(provider)
        headers = self.register()
        document_id = self.submit(headers).json()["document_id"]
        calls = len(provider.requests)
        self.service().run_study_pack(document_id)
        self.assertEqual(len(provider.requests), calls)

    def test_pack_responses_never_contain_answers(self) -> None:
        headers = self.register()
        self.submit(headers)
        listing = self.client.get("/api/study-packs", headers=headers)
        text = listing.text.lower()
        for word in ("answer", "explanation", "option", "grading"):
            self.assertNotIn(word, text)


class ListingAndOwnershipTests(StudyPackTestCase):
    def test_the_list_is_newest_first_and_only_yours(self) -> None:
        ada = self.register("ada")
        grace = self.register("grace")
        first = self.submit(ada).json()["document_id"]
        second = self.submit(ada).json()["document_id"]
        self.submit(grace)
        ids = [
            p["document_id"]
            for p in self.client.get("/api/study-packs", headers=ada).json()[
                "study_packs"
            ]
        ]
        self.assertEqual(ids, [second, first])
        self.assertEqual(
            len(
                self.client.get("/api/study-packs", headers=grace).json()["study_packs"]
            ),
            1,
        )

    def test_someone_elses_pack_looks_nonexistent(self) -> None:
        ada = self.register("ada")
        grace = self.register("grace")
        document_id = self.submit(ada).json()["document_id"]
        theirs = self.client.get(f"/api/study-packs/{document_id}", headers=grace)
        missing = self.client.get(f"/api/study-packs/{'0' * 32}", headers=grace)
        self.assertEqual(theirs.status_code, 404)
        self.assertEqual(theirs.json(), missing.json())

    def test_every_endpoint_needs_a_login(self) -> None:
        for method, path in (
            ("get", "/api/study-packs"),
            ("get", "/api/study-packs/x"),
            ("post", "/api/study-packs"),
        ):
            response = getattr(self.client, method)(path)
            self.assertEqual(response.status_code, 401, path)


class RejectedUploadTests(StudyPackTestCase):
    def assert_nothing_recorded(self, headers: dict[str, str]) -> None:
        self.assertEqual(
            self.client.get("/api/study-packs", headers=headers).json(),
            {"study_packs": []},
        )
        self.assertEqual(
            list(self.settings.documents_dir.glob("*.pdf"))
            if self.settings.documents_dir.exists()
            else [],
            [],
        )

    def test_unusable_pdfs_are_refused_immediately_and_leave_nothing_behind(
        self,
    ) -> None:
        headers = self.register()
        cases = {
            "empty_file": b"",
            "not_a_pdf": b"plain text, not a pdf",
            "malformed_pdf": b"%PDF-1.7\nnot really",
            "encrypted_pdf": make_encrypted_pdf(),
        }
        for code, data in cases.items():
            with self.subTest(code=code):
                response = self.client.post(
                    "/api/study-packs", headers=headers, files={"file": ("x.pdf", data)}
                )
                self.assertEqual(response.status_code, 422, response.text)
                self.assertEqual(response.json()["error"]["code"], code)
        self.assert_nothing_recorded(headers)

    def test_oversized_uploads_are_refused_before_the_body_is_read(self) -> None:
        self.settings = replace(self.settings, max_upload_bytes=1000)
        self.client = self.start_app()
        headers = self.register()
        response = self.client.post(
            "/api/study-packs", headers=headers,
            files={"file": ("big.pdf", b"%PDF-1.7\n" + b"0" * 200_000)},
        )  # fmt: skip
        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.json()["error"]["code"], "too_large")
        self.assert_nothing_recorded(headers)

    def test_form_fields_are_validated(self) -> None:
        headers = self.register()
        for form in (
            {"practice_count": 0},
            {"practice_count": 31},
            {"practice_count": "many"},
            {"topic": "x" * 201},
        ):
            with self.subTest(form=form):
                response = self.submit(headers, **form)
                self.assertEqual(response.status_code, 422)
                self.assertEqual(response.json()["error"]["code"], "invalid_request")
        missing = self.client.post(
            "/api/study-packs", headers=headers, data={"topic": "x"}
        )
        self.assertEqual(missing.status_code, 422)
        self.assert_nothing_recorded(headers)

    def test_without_a_game_master_nothing_is_accepted(self) -> None:
        from learning_game_backend.config import GameMasterMode

        self.settings = replace(self.settings, game_master_mode=GameMasterMode.DISABLED)
        self.provider = None
        self.client = self.start_app()
        headers = self.register()
        response = self.submit(headers)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["error"]["code"], "game_master_unavailable")
        self.assert_nothing_recorded(headers)


class FailureTests(StudyPackTestCase):
    def failed_pack(self, provider: ScriptedGameMaster) -> dict[str, Any]:
        self.client = self.start_app(provider)
        headers = self.register()
        document_id = self.submit(headers).json()["document_id"]
        return self.pack(headers, document_id)

    def test_an_indexing_failure_fails_the_pack_with_the_reason(self) -> None:
        pack = self.failed_pack(
            ScriptedGameMaster(
                ingest_error=ProviderError("The PDF has only scanned images.")
            )
        )
        self.assertEqual((pack["status"], pack["stage"]), ("failed", "failed"))
        self.assertEqual(pack["error"], "The PDF has only scanned images.")
        self.assertIsNone(pack["practice"])
        self.assertIsNone(pack["adventure"])

    def test_a_question_writing_failure_fails_the_pack_and_names_the_set(self) -> None:
        pack = self.failed_pack(
            ScriptedGameMaster(
                generate_error=ProviderError("The game master timed out.")
            )
        )
        self.assertEqual(pack["status"], "failed")
        self.assertIn("questions failed: The game master timed out.", pack["error"])
        self.assertEqual(
            {pack["practice"]["status"], pack["adventure"]["status"]}, {"failed"}
        )

    def test_invalid_game_master_output_fails_the_pack(self) -> None:
        pack = self.failed_pack(
            ScriptedGameMaster(
                payload={"schema_version": 1, "questions": [{"id": "x"}]}
            )
        )
        self.assertEqual(pack["status"], "failed")
        self.assertIn("unsupported type", pack["error"])

    def test_adventure_questions_missing_a_villains_level_fail_the_pack(self) -> None:

        def question(i: int) -> dict[str, Any]:
            return {
                "id": f"q{i}",
                "type": "numeric",
                "prompt": f"What is {i} + 1?",
                "answer": {"value": i + 1},
                "explanation": "Add one.",
                "difficulty": 2,  # never 1, 3, or 5
            }

        questions = [question(i) for i in range(3)]
        pack = self.failed_pack(
            ScriptedGameMaster(payload={"schema_version": 1, "questions": questions})
        )
        self.assertEqual(pack["status"], "failed")
        self.assertIn("missing difficulty level(s) 1, 3, 5", pack["error"])
        self.assertEqual(
            pack["practice"]["status"], "ready"
        )  # the practice set is still usable
        self.assertEqual(pack["adventure"]["status"], "ready")

    def test_an_unexpected_error_still_ends_the_pack_instead_of_leaving_it_running(
        self,
    ) -> None:
        headers = self.register()
        with mock.patch.object(
            GameService, "generate_question_set", side_effect=RuntimeError("boom")
        ):
            document_id = self.submit(headers).json()["document_id"]
        pack = self.pack(headers, document_id)
        self.assertEqual((pack["status"], pack["error"]), ("failed", "Internal error."))
        self.assertNotIn("boom", str(pack))


class RestartTests(StudyPackTestCase):
    def test_a_pack_interrupted_by_a_restart_is_failed_not_stuck(self) -> None:
        headers = self.register()
        pending = self.service().create_study_pack(
            self.account(), "a.pdf", make_pdf(), "t", 5
        )
        running = self.service().create_study_pack(
            self.account(), "b.pdf", make_pdf(), "t", 5
        )
        with closing(sqlite3.connect(self.settings.database_path)) as conn:
            conn.execute(
                "UPDATE study_packs SET status = 'processing' WHERE document_id = ?",
                (running["document_id"],),
            )
            conn.commit()
        self.client = self.start_app()
        headers = self.login("ada")
        for pack in (pending, running):
            after = self.pack(headers, pack["document_id"])
            self.assertEqual((after["status"], after["stage"]), ("failed", "failed"))
            self.assertEqual(after["error"], RESTART_ERROR)

    def test_a_finished_pack_survives_a_restart_unchanged(self) -> None:
        headers = self.register()
        document_id = self.submit(headers).json()["document_id"]
        before = self.pack(headers, document_id)
        self.client = self.start_app()
        self.assertEqual(self.pack(self.login("ada"), document_id), before)

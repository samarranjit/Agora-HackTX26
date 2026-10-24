"""The whole player journey through the HTTP API, with a backend restart in the middle.

Uses the fake game master, so this proves the backend's own behavior (accounts,
PDF intake, validation, persistence, idempotency, engine rules). It does not
prove anything about a real RAG pipeline.
"""

from typing import Any

from api_helpers import ApiTestCase, ScriptedGameMaster


class FullJourneyTests(ApiTestCase):
    def test_register_to_defeating_every_villain_across_a_restart(self) -> None:
        # 1-2. Register, log in, and upload a PDF.
        headers = self.register("ada")
        document_id = self.upload(headers)

        # 3. Ingestion finishes (the test client runs background jobs to completion).
        document = self.client.get(f"/api/documents/{document_id}", headers=headers)
        self.assertEqual(document.json()["status"], "ready")

        # 4. Generate practice and adventure questions from that document.
        self.question_set(headers, "practice", 5, document_id)
        self.question_set(headers, "adventure", 9, document_id)

        # 5. Earn enough XP to unlock the adventure (10+15+20+25+30 = 100).
        deltas = [self.practice(headers)["xp_delta"] for _ in range(5)]
        self.assertEqual(deltas, [10, 15, 20, 25, 30])
        state = self.state(headers)
        self.assertEqual((state["xp"], state["adventure_unlocked"]), (100, True))

        # 6. Start a battle once, even though the request is sent twice.
        key = self.key()
        first = self.client.post(
            "/api/adventure/battles", headers={**headers, **key}, json={}
        )
        retry = self.client.post(
            "/api/adventure/battles", headers={**headers, **key}, json={}
        )
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json(), retry.json())
        self.assertEqual(self.state(headers)["xp"], 70)

        # 7. Answer one question.
        answered = self.answer(headers, first.json()["attempt"]).json()
        self.assertTrue(answered["correct"])
        self.assertEqual(answered["xp"], 70 + answered["xp_delta"])
        pending = answered["next_attempt"]
        before = self.state(headers)

        # 8. Restart the backend (a brand-new app on the same data) and sign in again.
        guard = ScriptedGameMaster(generate_error=_unused())
        self.client = self.start_app(guard)
        headers = self.login("ada")

        # 9. The identical pending question comes back, with state unchanged.
        active = self.client.get("/api/me/active-attempt", headers=headers).json()
        self.assertEqual(active["attempt"], pending)
        self.assertEqual(self.state(headers), before)
        self.assertEqual(guard.requests, [])  # nothing was regenerated

        # 10. Finish this battle and every remaining villain.
        attempt: dict[str, Any] | None = pending
        outcomes: list[str] = []
        while True:
            while attempt is not None:
                body = self.answer(headers, attempt).json()
                attempt = body["next_attempt"]
                if body["encounter"]["outcome"] not in ("in_progress", "none"):
                    outcomes.append(body["encounter"]["outcome"])
            if len(outcomes) == 3:
                break
            started = self.start_battle(headers)
            self.assertEqual(started.status_code, 200, started.text)
            attempt = started.json()["attempt"]

        self.assertEqual(outcomes, ["won", "won", "won"])

        # 11. The authoritative state reports the finished adventure.
        final = self.state(headers)
        self.assertTrue(final["adventure_completed"])
        self.assertEqual(
            [villain["status"] for villain in final["villains"]], ["completed"] * 3
        )
        self.assertIsNone(final["active_battle"])
        status = self.client.get("/api/me/status", headers=headers).json()
        self.assertEqual(
            (status["adventure_completed"], status["xp"]), (True, final["xp"])
        )
        # Practice is still available after completion.
        self.assertEqual(
            self.practice(headers)["encounter"]["adventure_completed"], True
        )

        # A further battle is refused and charges nothing.
        xp_before = self.state(headers)["xp"]
        refused = self.start_battle(headers)
        self.assertEqual(refused.status_code, 409)
        self.assertEqual(refused.json()["error"]["code"], "adventure_completed")
        self.assertEqual(self.state(headers)["xp"], xp_before)


def _unused() -> Any:
    from learning_game_backend.rag.protocol import ProviderError

    return ProviderError("the provider must not be called after a restart")


if __name__ == "__main__":
    import unittest

    unittest.main()

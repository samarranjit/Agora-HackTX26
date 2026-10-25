"""The public HTTP API as described by OpenAPI, checked against the committed copy.

backend/contracts/openapi.json is what frontend developers read. If this test fails
after an intentional API change, regenerate it:
    uv run learning-game-api openapi contracts/openapi.json
"""

import json
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from typing import Any

from learning_game_backend.api.app import create_app
from learning_game_backend.config import GameMasterMode, Settings

COMMITTED = Path(__file__).resolve().parents[2] / "contracts" / "openapi.json"
# Response fields that would reveal an answer or private grading data.
PRIVATE_NAMES = {
    "answer",
    "correct_option_id",
    "correct_option",
    "grading",
    "tolerance",
    "answer_json",
    "grading_json",
    "numeric_answer",
}
# Schemas the player sees BEFORE answering a question.
PRE_ANSWER_SCHEMAS = (
    "PublicQuestion",
    "PracticeAttemptResponse",
    "BattleStartResponse",
    "ActiveAttemptResponse",
    "QuestionSetResponse",
    "QuestionSummary",
    "StudyPackResponse",
    "StudyPackSet",
    "StudyPackListResponse",
    "PublicOption",
    "BattleContext",
    "SourceAttribution",
)
MUTATIONS_NEEDING_KEYS = {
    ("post", "/api/adventure/battles"),
    ("post", "/api/attempts/{attempt_id}/answer"),
}


def generate_spec() -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as scratch:
        settings = replace(
            Settings(data_dir=Path(scratch)), game_master_mode=GameMasterMode.FAKE
        )
        spec: dict[str, Any] = json.loads(json.dumps(create_app(settings).openapi()))
        return spec


def property_names(schema: Any, schemas: dict[str, Any], seen: set[str]) -> set[str]:
    """Every property name reachable from a schema, following $ref."""
    names: set[str] = set()
    if isinstance(schema, dict):
        ref = schema.get("$ref")
        if isinstance(ref, str):
            name = ref.rsplit("/", 1)[-1]
            if name not in seen:
                seen.add(name)
                names |= property_names(schemas[name], schemas, seen)
        for key, value in schema.items():
            if key == "properties":
                names |= set(value)
                for sub in value.values():
                    names |= property_names(sub, schemas, seen)
            elif key != "$ref":
                names |= property_names(value, schemas, seen)
    elif isinstance(schema, list):
        for item in schema:
            names |= property_names(item, schemas, seen)
    return names


class OpenApiContractTests(unittest.TestCase):
    spec: dict[str, Any]
    schemas: dict[str, Any]

    @classmethod
    def setUpClass(cls) -> None:
        cls.spec = generate_spec()
        cls.schemas = cls.spec["components"]["schemas"]

    def test_committed_openapi_matches_the_code(self) -> None:
        committed = json.loads(COMMITTED.read_text(encoding="utf-8"))
        self.assertEqual(
            committed,
            self.spec,
            "contracts/openapi.json is out of date. Regenerate it with "
            "`uv run learning-game-api openapi contracts/openapi.json`.",
        )

    def test_the_documented_endpoints_exist(self) -> None:
        expected = {
            ("get", "/healthz"),
            ("post", "/api/auth/register"),
            ("post", "/api/auth/login"),
            ("post", "/api/auth/logout"),
            ("post", "/api/documents"),
            ("get", "/api/documents/{document_id}"),
            ("post", "/api/question-sets"),
            ("get", "/api/question-sets/{question_set_id}"),
            ("post", "/api/study-packs"),
            ("get", "/api/study-packs"),
            ("get", "/api/study-packs/{document_id}"),
            ("get", "/api/me/state"),
            ("get", "/api/me/status"),
            ("get", "/api/me/export"),
            ("post", "/api/me/restart"),
            ("get", "/api/me/active-attempt"),
            ("post", "/api/practice/attempts"),
            ("post", "/api/adventure/battles"),
            ("post", "/api/attempts/{attempt_id}/answer"),
        }
        actual = {
            (method, path)
            for path, operations in self.spec["paths"].items()
            for method in operations
        }
        self.assertEqual(actual, expected)

    def test_there_is_no_endpoint_that_sets_xp_health_or_state(self) -> None:
        for path in self.spec["paths"]:
            for word in ("xp", "health", "import", "set", "award", "reward"):
                self.assertNotIn(f"/{word}", path.lower().replace("/healthz", ""))

    def test_questions_shown_before_answering_have_no_answer_fields(self) -> None:
        for name in PRE_ANSWER_SCHEMAS:
            with self.subTest(schema=name):
                names = property_names({"$ref": f"#/components/schemas/{name}"},
                                       self.schemas, set())  # fmt: skip
                self.assertFalse(names & PRIVATE_NAMES, names & PRIVATE_NAMES)
                self.assertNotIn("explanation", names)

    def test_feedback_exists_only_in_the_answer_response(self) -> None:
        holders = [
            name
            for name, schema in self.schemas.items()
            if "feedback" in schema.get("properties", {})
        ]
        self.assertEqual(holders, ["AnswerResponse"])

    def test_requests_reject_unknown_fields(self) -> None:
        """So a client cannot send correctness, difficulty, XP, or health."""
        for name in ("AnswerRequest", "QuestionSetRequest", "OptionalQuestionSet"):
            with self.subTest(schema=name):
                self.assertIs(self.schemas[name].get("additionalProperties"), False)
        answer_fields = set(self.schemas["AnswerRequest"]["properties"])
        self.assertEqual(answer_fields, {"answer"})

    def test_retried_mutations_declare_the_idempotency_key(self) -> None:
        for method, path in MUTATIONS_NEEDING_KEYS:
            with self.subTest(path=path):
                parameters = self.spec["paths"][path][method]["parameters"]
                keys = [p for p in parameters if p["name"] == "Idempotency-Key"]
                self.assertEqual(len(keys), 1)
                self.assertTrue(keys[0]["required"])
                self.assertEqual(keys[0]["in"], "header")

    def test_state_fields_the_frontend_relies_on_are_present(self) -> None:
        answer = set(self.schemas["AnswerResponse"]["properties"])
        for field in (
            "xp_delta",
            "health_delta",
            "xp",
            "health",
            "state_version",
            "encounter",
        ):
            self.assertIn(field, answer)
        status = set(self.schemas["StatusResponse"]["properties"])
        self.assertEqual(
            status,
            {"schema_version", "state_version", "xp", "health", "max_health",
             "adventure_unlocked", "adventure_completed", "location"},
        )  # fmt: skip

    def test_error_responses_use_the_shared_error_schema(self) -> None:
        error = self.schemas["ErrorResponse"]["properties"]["error"]
        self.assertTrue(error)
        gameplay = self.spec["paths"]["/api/attempts/{attempt_id}/answer"]["post"]
        for status in ("401", "404", "409", "422"):
            ref = gameplay["responses"][status]["content"]["application/json"]["schema"]
            self.assertTrue(ref["$ref"].endswith("/ErrorResponse"), status)


if __name__ == "__main__":
    unittest.main()

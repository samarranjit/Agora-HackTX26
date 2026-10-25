"""Converting PlayerState to and from plain dictionaries."""

import copy
import json
import unittest
from typing import Any

from learning_game_engine.engine import GameEngine, InvalidState
from learning_game_engine.models import QuestionRef, Scene
from learning_game_engine.state_codec import (
    STATE_FORMAT_VERSION,
    StateCodecError,
    state_from_dict,
    state_to_dict,
)

VILLAINS = ("goblin", "troll", "dragon")


def engine_in_battle() -> GameEngine:
    """A state with a pending battle question and processed practice attempts."""
    engine = GameEngine.new_game("Zoë", slide_count=3, villain_ids=VILLAINS)
    for _ in range(5):
        engine.go_to(Scene.PRACTICE)
        pending = engine.present_practice_question("practice-1", 3)
        engine.submit_practice_result(pending.attempt_id, True)
    engine.go_to(Scene.PRACTICE)
    engine.present_practice_question("practice-2", 2)
    engine.go_to(Scene.ADVENTURE)
    refs = [QuestionRef("q1", 1)]
    engine.start_battle("goblin", refs)
    return engine


class RoundTripTests(unittest.TestCase):
    def test_a_full_state_survives_json(self) -> None:
        state = engine_in_battle().state
        encoded = json.dumps(state_to_dict(state))
        decoded = state_from_dict(json.loads(encoded))
        self.assertEqual(decoded, state)
        self.assertIsNotNone(decoded.pending_practice)
        self.assertIsNotNone(decoded.active_battle)

    def test_a_new_game_survives_json(self) -> None:
        state = GameEngine.new_game("Ada", slide_count=3, villain_ids=VILLAINS).state
        self.assertEqual(state_from_dict(state_to_dict(state)), state)

    def test_the_output_is_json_serializable_and_versioned(self) -> None:
        data = state_to_dict(engine_in_battle().state)
        json.dumps(data)
        self.assertEqual(data["format_version"], STATE_FORMAT_VERSION)
        self.assertEqual(STATE_FORMAT_VERSION, 2)

    def test_processed_attempts_are_written_sorted_for_stable_output(self) -> None:
        data: dict[str, Any] = state_to_dict(engine_in_battle().state)
        ids = data["processed_attempt_ids"]
        self.assertEqual(ids, sorted(ids))

    def test_the_encoder_does_not_share_mutable_state(self) -> None:
        state = engine_in_battle().state
        data: dict[str, Any] = state_to_dict(state)
        data["completed_villains"].append("troll")
        data["active_battle"]["questions"].clear()
        self.assertEqual(state.completed_villains, ())
        assert state.active_battle is not None
        self.assertEqual(len(state.active_battle.questions), 1)


class RejectionTests(unittest.TestCase):
    def valid(self) -> dict[str, Any]:
        data: dict[str, Any] = state_to_dict(engine_in_battle().state)
        return copy.deepcopy(data)

    def assert_rejected(self, data: object, fragment: str) -> None:
        with self.assertRaisesRegex(StateCodecError, fragment):
            state_from_dict(data)

    def test_structure_and_version(self) -> None:
        self.assert_rejected([1, 2], "JSON object")
        self.assert_rejected("text", "JSON object")
        self.assert_rejected({**self.valid(), "format_version": 1}, "version")
        self.assert_rejected({**self.valid(), "format_version": None}, "version")
        self.assert_rejected({}, "version")

    def test_missing_and_unexpected_fields(self) -> None:
        data = self.valid()
        del data["xp"]
        self.assert_rejected(data, "missing fields: xp")
        self.assert_rejected({**self.valid(), "points": 5}, "unexpected fields: points")
        nested = self.valid()
        del nested["active_battle"]["pending_attempt_id"]
        self.assert_rejected(nested, "missing fields: pending_attempt_id")
        nested = self.valid()
        nested["pending_practice"]["bonus"] = 1
        self.assert_rejected(nested, "unexpected fields: bonus")

    def test_wrong_types(self) -> None:
        for key, value, fragment in (
            ("xp", "70", "xp"),
            ("xp", True, "xp"),
            ("xp", 1.5, "xp"),
            ("health", None, "health"),
            ("player_name", 7, "player_name"),
            ("adventure_unlocked", 1, "adventure_unlocked"),
            ("completed_villains", "goblin", "completed_villains"),
            ("completed_villains", [1], "completed_villains"),
            ("active_battle", [1], "active_battle"),
            ("pending_practice", "x", "pending_practice"),
            ("scene", "castle", "scene"),
        ):
            with self.subTest(key=key, value=value):
                self.assert_rejected({**self.valid(), key: value}, fragment)

    def test_difficulties_must_be_whole_numbers_from_one_to_five(self) -> None:
        for value in (0, 6, 2.5, "3", True, None):
            with self.subTest(value=value):
                data = self.valid()
                data["active_battle"]["questions"][0]["difficulty"] = value
                self.assert_rejected(data, "difficulty")
                data = self.valid()
                data["pending_practice"]["difficulty"] = value
                self.assert_rejected(data, "difficulty")

    def test_negative_xp_is_rejected_here_not_only_by_the_engine(self) -> None:
        self.assert_rejected({**self.valid(), "xp": -1}, "negative")

    def test_battle_questions_must_be_a_list_of_objects(self) -> None:
        data = self.valid()
        data["active_battle"]["questions"] = "none"
        self.assert_rejected(data, "list")
        data = self.valid()
        data["active_battle"]["questions"] = ["q1"]
        self.assert_rejected(data, "object")


class DivisionOfResponsibilityTests(unittest.TestCase):
    """The codec checks shape; the engine checks the rules."""

    def test_a_well_formed_but_impossible_state_decodes_and_is_then_refused(
        self,
    ) -> None:
        data: dict[str, Any] = state_to_dict(engine_in_battle().state)
        data["health"] = 0  # battle in progress at zero health
        state = state_from_dict(data)
        with self.assertRaises(InvalidState):
            GameEngine(state, slide_count=3, villain_ids=VILLAINS)


if __name__ == "__main__":
    unittest.main()

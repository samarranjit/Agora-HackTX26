"""The data classes: immutability and the few derived values."""

import dataclasses
import unittest

from learning_game_engine.models import (
    ActiveBattle,
    BattleOutcome,
    PendingAttempt,
    PlayerState,
    QuestionRef,
    Scene,
)


def battle(position: int = 0) -> ActiveBattle:
    return ActiveBattle(
        villain_id="goblin",
        battle_attempt_id="b1",
        questions=(QuestionRef("q1", 1), QuestionRef("q2", 3), QuestionRef("q3", 5)),
        position=position,
        correct_count=0,
        pending_attempt_id="a1",
    )


class ActiveBattleTests(unittest.TestCase):
    def test_current_question_follows_the_position(self) -> None:
        self.assertEqual(battle(0).current_question, QuestionRef("q1", 1))
        self.assertEqual(battle(2).current_question_id, "q3")
        self.assertEqual(battle(1).current_question.difficulty, 3)


class ImmutabilityTests(unittest.TestCase):
    def test_every_state_class_is_frozen(self) -> None:
        state = PlayerState(
            player_name="Ada",
            scene=Scene.PLAYGROUND,
            xp=0,
            health=100,
            adventure_unlocked=False,
            lesson_position=0,
            lesson_completed=False,
            practice_position=0,
            pending_practice=PendingAttempt("a", "q", 1),
            completed_villains=(),
            active_battle=battle(),
            processed_attempt_ids=frozenset(),
        )
        for instance, field in (
            (state, "xp"),
            (state.pending_practice, "difficulty"),
            (state.active_battle, "position"),
            (QuestionRef("q", 1), "difficulty"),
        ):
            with (
                self.subTest(cls=type(instance).__name__),
                self.assertRaises(dataclasses.FrozenInstanceError),
            ):
                setattr(instance, field, 99)

    def test_collections_in_state_cannot_be_mutated(self) -> None:
        self.assertIsInstance(battle().questions, tuple)
        self.assertIsInstance(frozenset(), frozenset)


class EnumTests(unittest.TestCase):
    def test_enum_values_are_the_strings_that_get_stored(self) -> None:
        self.assertEqual(
            [scene.value for scene in Scene],
            ["playground", "lesson", "practice", "adventure", "battle"],
        )
        self.assertEqual(BattleOutcome.KNOCKED_OUT.value, "knocked out")
        self.assertEqual(Scene("battle"), Scene.BATTLE)


if __name__ == "__main__":
    unittest.main()

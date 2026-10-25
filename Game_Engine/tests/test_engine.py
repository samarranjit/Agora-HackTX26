"""Progression rules: XP, health, unlocking, battles, and attempt handling."""

import subprocess
import sys
import tomllib
import unittest
from collections.abc import Sequence
from dataclasses import FrozenInstanceError, replace
from pathlib import Path

from learning_game_engine.engine import GameEngine, InvalidAction, InvalidState
from learning_game_engine.models import (
    AdventureStatus,
    BattleOutcome,
    BattleResult,
    PendingAttempt,
    PracticeResult,
    QuestionRef,
    Scene,
    VillainStatus,
)
from learning_game_engine.rules import DEFAULT_RULES, Rules

VILLAINS = ("goblin", "troll", "dragon")
# Difficulty 3 practice is worth 20 XP, so earn(engine, 100) takes 5 answers.
PRACTICE_DIFFICULTY = 3


def battle_refs(difficulty: int = 1) -> tuple[QuestionRef, ...]:
    return (QuestionRef("q1", difficulty),)


def new_engine(rules: Rules = DEFAULT_RULES) -> GameEngine:
    return GameEngine.new_game("Ada", slide_count=3, villain_ids=VILLAINS, rules=rules)


def answer_practice(
    engine: GameEngine, correct: bool = True, difficulty: int = PRACTICE_DIFFICULTY
) -> PracticeResult:
    engine.go_to(Scene.PRACTICE)
    pending = engine.present_practice_question("practice-1", difficulty)
    return engine.submit_practice_result(pending.attempt_id, correct)


def earn(engine: GameEngine, xp: int) -> None:
    for _ in range(xp // 20):
        answer_practice(engine)


def start_next_battle(engine: GameEngine, difficulty: int = 1) -> None:
    villain_id = engine.next_villain_id
    assert villain_id is not None
    engine.go_to(Scene.ADVENTURE)
    engine.start_battle(villain_id, battle_refs(difficulty))


def answer_battle(engine: GameEngine, correct: bool) -> BattleResult:
    battle = engine.state.active_battle
    assert battle is not None
    return engine.submit_battle_result(battle.pending_attempt_id, correct)


def fight(
    engine: GameEngine, answers: Sequence[bool], difficulty: int = 1
) -> BattleResult:
    """Start a battle against the next villain and answer every question."""
    start_next_battle(engine, difficulty)
    results = [answer_battle(engine, correct) for correct in answers]
    return results[-1]


WIN = (True,)
LOSE = (False,)


class NewGameTests(unittest.TestCase):
    def test_initial_state(self) -> None:
        engine = new_engine()
        state = engine.state
        self.assertEqual(state.player_name, "Ada")
        self.assertEqual(state.scene, Scene.PLAYGROUND)
        self.assertEqual(state.xp, 0)
        self.assertEqual(state.health, 100)
        self.assertEqual(state.practice_position, 0)
        self.assertFalse(state.adventure_unlocked)
        self.assertEqual(state.lesson_position, 0)
        self.assertIsNone(state.pending_practice)
        self.assertIsNone(state.active_battle)
        self.assertEqual(state.completed_villains, ())
        self.assertEqual(engine.adventure_status, AdventureStatus.LOCKED)
        self.assertEqual(engine.next_villain_id, "goblin")

    def test_blank_name_is_rejected(self) -> None:
        with self.assertRaises(InvalidAction):
            GameEngine.new_game("   ", slide_count=3, villain_ids=VILLAINS)

    def test_returned_state_cannot_be_modified(self) -> None:
        engine = new_engine()
        with self.assertRaises(FrozenInstanceError):
            engine.state.xp = 500  # type: ignore[misc]
        self.assertEqual(engine.state.xp, 0)


class LessonTests(unittest.TestCase):
    def test_reading_advances_without_xp_and_wraps_for_review(self) -> None:
        engine = new_engine()
        engine.go_to(Scene.LESSON)
        self.assertFalse(engine.next_slide())
        self.assertFalse(engine.next_slide())
        self.assertEqual(engine.state.lesson_position, 2)
        self.assertTrue(engine.next_slide())
        self.assertTrue(engine.state.lesson_completed)
        self.assertEqual(engine.state.lesson_position, 0)
        self.assertEqual(engine.state.xp, 0)

    def test_slides_only_advance_in_the_lesson(self) -> None:
        engine = new_engine()
        with self.assertRaises(InvalidAction):
            engine.next_slide()


class PracticeTests(unittest.TestCase):
    def test_correct_answer_reward_depends_on_difficulty(self) -> None:
        for difficulty, reward in zip(range(1, 6), (10, 15, 20, 25, 30), strict=True):
            with self.subTest(difficulty=difficulty):
                engine = new_engine()
                result = answer_practice(engine, True, difficulty)
                self.assertEqual(result.xp_delta, reward)
                self.assertEqual(engine.state.xp, reward)
                self.assertEqual(engine.state.practice_position, 1)

    def test_practice_cost_and_flat_reward(self) -> None:
        engine = new_engine(
            Rules(starting_xp=100, practice_cost=50, practice_correct_xp=50)
        )
        engine.go_to(Scene.PRACTICE)
        pending = engine.present_practice_question("practice-1", 1)
        self.assertEqual(engine.state.xp, 50)
        result = engine.submit_practice_result(pending.attempt_id, True)
        self.assertEqual(result.xp_delta, 50)
        self.assertEqual(engine.state.xp, 100)

    def test_practice_is_refused_when_the_entry_cost_cannot_be_paid(self) -> None:
        engine = new_engine(Rules(practice_cost=50))
        engine.go_to(Scene.PRACTICE)
        with self.assertRaisesRegex(InvalidAction, "50 XP"):
            engine.present_practice_question("practice-1", 1)
        self.assertEqual(engine.state.xp, 0)
        self.assertIsNone(engine.state.pending_practice)

    def test_incorrect_answer_changes_neither_xp_nor_health(self) -> None:
        engine = new_engine(Rules(starting_health=50))
        answer_practice(engine, correct=True)
        result = answer_practice(engine, correct=False, difficulty=5)
        self.assertEqual((result.xp_delta, result.health_delta), (0, 0))
        self.assertEqual(engine.state.xp, 20)
        self.assertEqual(engine.state.health, 55)
        self.assertEqual(engine.state.practice_position, 2)

    def test_correct_answer_restores_health_up_to_the_maximum(self) -> None:
        engine = new_engine(Rules(starting_health=97))
        result = answer_practice(engine, correct=True)
        self.assertEqual(result.health_delta, 3)
        self.assertEqual(engine.state.health, 100)
        self.assertEqual(answer_practice(engine, correct=True).health_delta, 0)

    def test_invalid_difficulty_is_rejected(self) -> None:
        engine = new_engine()
        engine.go_to(Scene.PRACTICE)
        before = engine.state
        for difficulty in (0, 6, True, "3", 2.5):
            with (
                self.subTest(difficulty=difficulty),
                self.assertRaisesRegex(InvalidAction, "difficulty"),
            ):
                engine.present_practice_question(
                    "practice-1",
                    difficulty,  # type: ignore[arg-type]
                )
        self.assertEqual(engine.state, before)

    def test_pending_question_cannot_be_replaced(self) -> None:
        engine = new_engine()
        engine.go_to(Scene.PRACTICE)
        engine.present_practice_question("practice-1", 1)
        before = engine.state
        with self.assertRaises(InvalidAction):
            engine.present_practice_question("practice-2", 1)
        self.assertEqual(engine.state, before)

    def test_duplicate_result_is_rejected_without_second_reward(self) -> None:
        engine = new_engine()
        engine.go_to(Scene.PRACTICE)
        pending = engine.present_practice_question("practice-1", 3)
        engine.submit_practice_result(pending.attempt_id, True)
        with self.assertRaisesRegex(InvalidAction, "already been processed"):
            engine.submit_practice_result(pending.attempt_id, True)
        self.assertEqual(engine.state.xp, 20)
        self.assertEqual(engine.state.practice_position, 1)

    def test_unknown_attempt_is_rejected(self) -> None:
        engine = new_engine()
        engine.go_to(Scene.PRACTICE)
        engine.present_practice_question("practice-1", 1)
        before = engine.state
        with self.assertRaisesRegex(InvalidAction, "does not match"):
            engine.submit_practice_result("not-an-attempt", True)
        self.assertEqual(engine.state, before)

    def test_same_content_can_earn_again_with_a_fresh_attempt(self) -> None:
        engine = new_engine()
        first = answer_practice(engine)
        second = answer_practice(engine)
        self.assertEqual((first.xp_delta, second.xp_delta), (20, 20))
        self.assertEqual(engine.state.xp, 40)

    def test_non_boolean_result_does_not_award_xp(self) -> None:
        engine = new_engine()
        engine.go_to(Scene.PRACTICE)
        pending = engine.present_practice_question("practice-1", 3)
        before = engine.state
        for value in ("false", "true", 1, 0, None):
            with self.subTest(value=value):
                with self.assertRaisesRegex(InvalidAction, "true or false"):
                    engine.submit_practice_result(
                        pending.attempt_id,
                        value,  # type: ignore[arg-type]
                    )
                self.assertEqual(engine.state, before)
        result = engine.submit_practice_result(pending.attempt_id, True)
        self.assertEqual(result.xp_delta, 20)
        self.assertEqual(engine.state.xp, 20)


class UnlockTests(unittest.TestCase):
    def test_adventure_unlocks_at_threshold_and_stays_unlocked(self) -> None:
        engine = new_engine()
        earn(engine, 80)
        self.assertFalse(engine.state.adventure_unlocked)
        self.assertEqual(engine.xp_to_unlock, 20)

        result = answer_practice(engine)
        self.assertTrue(result.adventure_unlocked_now)
        self.assertEqual(engine.adventure_status, AdventureStatus.UNLOCKED)

        # Entry -30, one wrong at difficulty 1 costs 2 more.
        fight(engine, LOSE)
        self.assertEqual(engine.state.xp, 68)
        self.assertTrue(engine.state.adventure_unlocked)
        self.assertFalse(answer_practice(engine).adventure_unlocked_now)

    def test_unlocking_does_not_start_adventure(self) -> None:
        engine = new_engine()
        earn(engine, 100)
        self.assertEqual(engine.state.scene, Scene.PRACTICE)
        self.assertIsNone(engine.state.active_battle)

    def test_locked_adventure_is_rejected(self) -> None:
        engine = new_engine()
        earn(engine, 40)
        before = engine.state
        with self.assertRaisesRegex(InvalidAction, "Earn 60 more XP"):
            engine.go_to(Scene.ADVENTURE)
        self.assertEqual(engine.state, before)


class BattleEntryTests(unittest.TestCase):
    def test_entry_cost_is_charged_exactly_once(self) -> None:
        engine = new_engine()
        earn(engine, 100)
        start_next_battle(engine)
        self.assertEqual(engine.state.xp, 70)
        self.assertEqual(engine.state.scene, Scene.BATTLE)
        answer_battle(engine, True)
        self.assertEqual(engine.state.xp, 80)

    def test_insufficient_xp_is_rejected_without_change(self) -> None:
        engine = new_engine()
        earn(engine, 100)
        for _ in range(3):
            fight(engine, LOSE)
        self.assertEqual(engine.state.xp, 4)
        self.assertEqual(engine.battle_shortfall, 26)
        before = engine.state
        with self.assertRaisesRegex(InvalidAction, "Earn 26 more XP"):
            engine.start_battle("goblin", battle_refs())
        self.assertEqual(engine.state, before)

    def test_paid_battle_can_finish_at_zero_xp(self) -> None:
        engine = new_engine(Rules(battle_cost=100))
        earn(engine, 100)
        result = fight(engine, LOSE)
        self.assertEqual(result.outcome, BattleOutcome.LOST)
        self.assertEqual(engine.state.xp, 0)
        self.assertEqual(engine.state.health, 95)

    def test_locked_villain_cannot_start(self) -> None:
        engine = new_engine()
        earn(engine, 100)
        engine.go_to(Scene.ADVENTURE)
        with self.assertRaisesRegex(InvalidAction, "earlier villains"):
            engine.start_battle("troll", battle_refs())
        self.assertEqual(engine.state.xp, 100)

    def test_completed_villain_cannot_be_replayed(self) -> None:
        engine = new_engine()
        earn(engine, 100)
        fight(engine, WIN)
        with self.assertRaisesRegex(InvalidAction, "already been defeated"):
            engine.start_battle("goblin", battle_refs())

    def test_unknown_villain_and_wrong_questions_are_rejected(self) -> None:
        engine = new_engine()
        earn(engine, 100)
        engine.go_to(Scene.ADVENTURE)
        with self.assertRaises(InvalidAction):
            engine.start_battle("kraken", battle_refs())
        with self.assertRaises(InvalidAction):
            engine.start_battle("goblin", ())
        bad_difficulty = (QuestionRef("q1", 9),)
        with self.assertRaisesRegex(InvalidAction, "difficulty"):
            engine.start_battle("goblin", bad_difficulty)
        self.assertEqual(engine.state.xp, 100)


class BattleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = new_engine()
        earn(self.engine, 100)

    def test_one_correct_answer_wins(self) -> None:
        result = fight(self.engine, WIN)
        self.assertEqual(result.outcome, BattleOutcome.WON)
        self.assertEqual(self.engine.state.completed_villains, ("goblin",))
        self.assertEqual(self.engine.villain_status("troll"), VillainStatus.CURRENT)
        self.assertEqual(self.engine.state.scene, Scene.ADVENTURE)
        self.assertIsNone(self.engine.state.active_battle)

    def test_incorrect_answer_loses_and_keeps_villain(self) -> None:
        result = fight(self.engine, LOSE)
        self.assertEqual(result.outcome, BattleOutcome.LOST)
        self.assertEqual(self.engine.state.completed_villains, ())
        self.assertEqual(self.engine.next_villain_id, "goblin")
        self.assertEqual(self.engine.villain_status("goblin"), VillainStatus.CURRENT)

    def test_the_single_question_completes_the_encounter(self) -> None:
        result = fight(self.engine, WIN)
        self.assertEqual(result.outcome, BattleOutcome.WON)
        self.assertEqual(result.question_number, 1)
        self.assertIsNone(self.engine.state.active_battle)

    def test_retry_charges_again(self) -> None:
        fight(self.engine, LOSE)
        self.assertEqual(self.engine.state.xp, 68)
        start_next_battle(self.engine)
        self.assertEqual(self.engine.state.xp, 38)
        battle = self.engine.state.active_battle
        assert battle is not None
        self.assertEqual(battle.position, 0)
        self.assertEqual(battle.correct_count, 0)

    def test_duplicate_and_stale_answers_are_rejected(self) -> None:
        start_next_battle(self.engine)
        battle = self.engine.state.active_battle
        assert battle is not None
        first_attempt = battle.pending_attempt_id
        self.engine.submit_battle_result(first_attempt, True)
        before = self.engine.state
        with self.assertRaisesRegex(InvalidAction, "already been processed"):
            self.engine.submit_battle_result(first_attempt, True)
        with self.assertRaisesRegex(InvalidAction, "does not match"):
            self.engine.submit_battle_result("unknown", True)
        self.assertEqual(self.engine.state, before)

    def test_practice_cannot_progress_during_battle(self) -> None:
        self.engine.go_to(Scene.PRACTICE)
        pending = self.engine.present_practice_question("practice-1", 1)
        start_next_battle(self.engine)
        before = self.engine.state
        with self.assertRaises(InvalidAction):
            self.engine.go_to(Scene.PRACTICE)
        with self.assertRaises(InvalidAction):
            self.engine.submit_practice_result(pending.attempt_id, True)
        with self.assertRaises(InvalidAction):
            # A practice attempt is not the battle's pending question.
            self.engine.submit_battle_result(pending.attempt_id, True)
        self.assertEqual(self.engine.state, before)

    def test_answer_without_active_battle_is_rejected(self) -> None:
        with self.assertRaises(InvalidAction):
            self.engine.submit_battle_result("anything", True)

    def test_non_boolean_result_does_not_change_the_battle(self) -> None:
        start_next_battle(self.engine)
        battle = self.engine.state.active_battle
        assert battle is not None
        before = self.engine.state
        with self.assertRaisesRegex(InvalidAction, "true or false"):
            self.engine.submit_battle_result(
                battle.pending_attempt_id,
                "false",  # type: ignore[arg-type]
            )
        self.assertEqual(self.engine.state, before)
        self.engine.submit_battle_result(battle.pending_attempt_id, False)
        self.assertEqual(self.engine.state.xp, 68)
        self.assertIsNone(self.engine.state.active_battle)
        self.assertEqual(self.engine.state.completed_villains, ())


class BattleEconomyTests(unittest.TestCase):
    def test_victory_can_leave_xp_unchanged(self) -> None:
        engine = new_engine(Rules(award_battle_xp=False, battle_cost=0))
        earn(engine, 100)
        before = engine.state.xp
        result = fight(engine, WIN)
        self.assertEqual(result.outcome, BattleOutcome.WON)
        self.assertEqual((result.xp_delta, engine.state.xp), (0, before))

    def test_correct_battle_answer_earns_xp_by_difficulty(self) -> None:
        engine = new_engine()
        earn(engine, 100)
        start_next_battle(engine, difficulty=4)
        result = answer_battle(engine, True)
        self.assertEqual((result.xp_delta, result.health_delta), (25, 0))
        self.assertEqual(engine.state.xp, 95)

    def test_wrong_guardian_answer_can_cost_a_flat_amount(self) -> None:
        engine = new_engine(
            Rules(starting_xp=100, battle_cost=0, battle_wrong_xp=100)
        )
        start_next_battle(engine, difficulty=1)
        result = answer_battle(engine, False)
        self.assertEqual(result.xp_delta, -100)
        self.assertEqual(engine.state.xp, 0)

    def test_wrong_battle_answer_costs_xp_and_health_by_difficulty(self) -> None:
        engine = new_engine()
        earn(engine, 100)
        start_next_battle(engine, difficulty=4)
        result = answer_battle(engine, False)
        self.assertEqual((result.xp_delta, result.health_delta), (-8, -20))
        self.assertEqual((engine.state.xp, engine.state.health), (62, 80))

    def test_xp_loss_is_clamped_and_the_applied_delta_is_reported(self) -> None:
        engine = new_engine(Rules(battle_cost=95))
        earn(engine, 100)
        start_next_battle(engine, difficulty=5)
        result = answer_battle(engine, False)
        self.assertEqual(result.xp_delta, -5)
        self.assertEqual(engine.state.xp, 0)

    def test_zero_health_ends_battle_immediately_without_refund(self) -> None:
        engine = new_engine(Rules(starting_health=0))
        earn(engine, 100)
        self.assertEqual(engine.state.health, 25)
        result = fight(engine, LOSE, difficulty=5)

        self.assertEqual(result.outcome, BattleOutcome.KNOCKED_OUT)
        self.assertEqual(result.question_number, 1)
        self.assertEqual(result.health_delta, -25)
        state = engine.state
        self.assertEqual(state.health, 0)
        self.assertEqual(state.xp, 60)
        self.assertEqual(state.scene, Scene.PLAYGROUND)
        self.assertIsNone(state.active_battle)
        self.assertEqual(engine.state.completed_villains, ())
        self.assertEqual(engine.next_villain_id, "goblin")

    def test_practice_recovery_is_required_before_the_next_battle(self) -> None:
        engine = new_engine(Rules(starting_health=0))
        earn(engine, 100)
        start_next_battle(engine, difficulty=5)
        answer_battle(engine, False)
        self.assertEqual(engine.state.health, 0)

        engine.go_to(Scene.ADVENTURE)
        before = engine.state
        with self.assertRaisesRegex(InvalidAction, "recover health"):
            engine.start_battle("goblin", battle_refs())
        self.assertEqual(engine.state, before)

        answer_practice(engine, correct=False)
        self.assertEqual(engine.state.health, 0)
        answer_practice(engine, correct=True)
        self.assertEqual(engine.state.health, 5)
        start_next_battle(engine)
        self.assertIsNotNone(engine.state.active_battle)

    def test_health_is_not_reset_by_scene_changes_or_battle_entry(self) -> None:
        engine = new_engine()
        earn(engine, 100)
        fight(engine, LOSE)
        self.assertEqual(engine.state.health, 95)
        engine.go_to(Scene.PLAYGROUND)
        engine.go_to(Scene.ADVENTURE)
        start_next_battle(engine)
        self.assertEqual(engine.state.health, 95)


class CompletionTests(unittest.TestCase):
    def test_dragon_victory_completes_adventure(self) -> None:
        engine = new_engine()
        earn(engine, 100)
        # Each WIN at difficulty 1: entry -30 and one correct answer +10.
        fight(engine, WIN)
        fight(engine, WIN)
        self.assertEqual(engine.state.xp, 60)
        result = fight(engine, WIN)
        self.assertTrue(result.adventure_completed)
        self.assertEqual(engine.adventure_status, AdventureStatus.COMPLETED)
        self.assertIsNone(engine.next_villain_id)
        self.assertEqual(engine.state.completed_villains, VILLAINS)
        with self.assertRaises(InvalidAction):
            engine.start_battle("dragon", battle_refs())

    def test_practice_remains_available_after_completion(self) -> None:
        engine = new_engine()
        earn(engine, 100)
        for _ in VILLAINS:
            fight(engine, WIN)
        self.assertEqual((engine.state.xp, engine.state.health), (40, 100))
        result = answer_practice(engine)
        self.assertEqual(result.xp_delta, 20)
        self.assertEqual((engine.state.xp, engine.state.health), (60, 100))


class InvariantTests(unittest.TestCase):
    def setUp(self) -> None:
        engine = new_engine()
        earn(engine, 100)
        start_next_battle(engine)
        self.battle_state = engine.state

    def assert_invalid(self, **changes: object) -> None:
        state = replace(self.battle_state, **changes)  # type: ignore[arg-type]
        with self.assertRaises(InvalidState):
            GameEngine(state, slide_count=3, villain_ids=VILLAINS)

    def test_valid_state_is_accepted(self) -> None:
        GameEngine(self.battle_state, slide_count=3, villain_ids=VILLAINS)

    def test_impossible_states_are_rejected(self) -> None:
        battle = self.battle_state.active_battle
        assert battle is not None
        self.assert_invalid(xp=-1)
        self.assert_invalid(health=-1)
        self.assert_invalid(health=101)
        self.assert_invalid(health=0)
        self.assert_invalid(lesson_position=3)
        self.assert_invalid(adventure_unlocked=False)
        self.assert_invalid(scene=Scene.PLAYGROUND)
        self.assert_invalid(active_battle=replace(battle, correct_count=1))
        self.assert_invalid(active_battle=replace(battle, position=1))
        self.assert_invalid(active_battle=replace(battle, villain_id="troll"))
        self.assert_invalid(
            active_battle=replace(battle, questions=battle_refs(difficulty=6))
        )
        self.assert_invalid(completed_villains=("troll",))
        self.assert_invalid(
            processed_attempt_ids=frozenset({battle.pending_attempt_id})
        )
        self.assert_invalid(pending_practice=PendingAttempt("a1", "practice-1", 0))

    def test_battle_against_completed_villain_is_rejected(self) -> None:
        self.assert_invalid(completed_villains=("goblin",))

    def test_battle_after_completion_is_rejected(self) -> None:
        self.assert_invalid(completed_villains=VILLAINS)


class ImportIsolationTests(unittest.TestCase):
    """The engine must stay free of web, database, HTTP, PDF, and auth code."""

    FORBIDDEN = (
        "fastapi", "starlette", "pydantic", "uvicorn", "httpx", "sqlite3",
        "pypdf", "argon2", "learning_game_backend", "learning_game",
    )  # fmt: skip

    def test_importing_the_engine_loads_no_server_modules(self) -> None:
        code = (
            "import sys\n"
            "import learning_game_engine.engine, learning_game_engine.state_codec\n"
            "import learning_game_engine.models, learning_game_engine.rules\n"
            f"bad = [m for m in {self.FORBIDDEN!r} if m in sys.modules]\n"
            "print(','.join(bad))\n"
        )
        result = subprocess.run(
            [sys.executable, "-I", "-c", code],
            capture_output=True, text=True, check=True,
        )  # fmt: skip
        self.assertEqual(result.stdout.strip(), "")

    def test_the_engine_declares_no_runtime_dependencies(self) -> None:
        pyproject = Path(__file__).resolve().parent.parent / "pyproject.toml"
        data = tomllib.loads(pyproject.read_text(encoding="utf-8"))
        self.assertEqual(data["project"]["dependencies"], [])


if __name__ == "__main__":
    unittest.main()

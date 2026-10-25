"""The numeric rules and their validation."""

import unittest

from learning_game_engine.rules import (
    DEFAULT_RULES,
    MAX_DIFFICULTY,
    MIN_DIFFICULTY,
    Rules,
    is_valid_difficulty,
)


class RulesValidationTests(unittest.TestCase):
    def test_impossible_rule_combinations_are_rejected(self) -> None:
        invalid_changes: list[dict[str, object]] = [
            {"battle_wins_required": 4},
            {"battle_cost": -1},
            {"battle_question_count": 0},
            {"correct_xp_by_difficulty": (10, 20)},
            {"correct_xp_by_difficulty": (10, 15, -20, 25, 30)},
            {"starting_health": 101},
            {"max_health": 0},
            {"min_health_to_start_battle": 0},
        ]
        for changes in invalid_changes:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                Rules(**changes)  # type: ignore[arg-type]


class DefaultRuleTests(unittest.TestCase):
    def test_the_documented_defaults(self) -> None:
        rules = DEFAULT_RULES
        self.assertEqual(rules.correct_xp_by_difficulty, (10, 15, 20, 25, 30))
        self.assertEqual(
            [rules.correct_reward(d) for d in range(1, 6)], [10, 15, 20, 25, 30]
        )
        self.assertEqual((rules.starting_xp, rules.unlock_threshold), (0, 100))
        self.assertEqual((rules.battle_cost, rules.battle_question_count), (30, 1))
        self.assertEqual(rules.battle_wins_required, 1)
        self.assertEqual((rules.starting_health, rules.max_health), (100, 100))
        self.assertEqual(rules.battle_wrong_xp_per_difficulty, 2)
        self.assertEqual(rules.battle_wrong_health_per_difficulty, 5)
        self.assertEqual(rules.practice_correct_health_restore, 5)

    def test_rules_are_immutable(self) -> None:
        with self.assertRaises(AttributeError):
            DEFAULT_RULES.battle_cost = 0  # type: ignore[misc]


class DifficultyTests(unittest.TestCase):
    def test_only_whole_numbers_from_one_to_five_are_valid(self) -> None:
        self.assertEqual((MIN_DIFFICULTY, MAX_DIFFICULTY), (1, 5))
        for good in range(1, 6):
            self.assertTrue(is_valid_difficulty(good), good)
        bad_values: list[object] = [0, 6, -1, 2.5, "3", None, True, False]
        for bad in bad_values:
            self.assertFalse(is_valid_difficulty(bad), bad)


if __name__ == "__main__":
    unittest.main()

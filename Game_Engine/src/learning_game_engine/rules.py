"""Numerical gameplay rules, kept together so they are easy to find and change.

These values are initial product choices for the prototype, not tested
educational or economic settings. See README.md for how they differ from the
original fixed-reward prototype.
"""

from dataclasses import dataclass

# Question difficulty is an integer from 1 (easiest) to 5 (hardest).
MIN_DIFFICULTY = 1
MAX_DIFFICULTY = 5


def is_valid_difficulty(value: object) -> bool:
    # bool is a subclass of int in Python, so exclude it explicitly.
    return (
        isinstance(value, int)
        and not isinstance(value, bool)
        and MIN_DIFFICULTY <= value <= MAX_DIFFICULTY
    )


@dataclass(frozen=True)
class Rules:
    """XP values, health values, and battle requirements.

    Raises ValueError on construction if the combination is impossible,
    for example needing more correct answers than a battle has questions.
    """

    starting_xp: int = 0
    unlock_threshold: int = 100
    # XP for a correct answer, indexed by difficulty 1..5. Used in practice
    # and in battles.
    correct_xp_by_difficulty: tuple[int, ...] = (10, 15, 20, 25, 30)
    # A wrong battle answer costs this many XP per difficulty level.
    battle_wrong_xp_per_difficulty: int = 2
    battle_cost: int = 30
    # Ground-zero adventure: one question per villain. With three villains,
    # this makes three adventure questions total (easy, harder, final).
    battle_question_count: int = 1
    battle_wins_required: int = 1

    max_health: int = 100
    starting_health: int = 100
    # A wrong battle answer costs this much health per difficulty level.
    battle_wrong_health_per_difficulty: int = 5
    practice_correct_health_restore: int = 5
    # Health needed to start a battle. With the default of 1, a player whose
    # health reached zero must answer practice questions correctly first.
    min_health_to_start_battle: int = 1

    def __post_init__(self) -> None:
        for name in (
            "starting_xp",
            "unlock_threshold",
            "battle_wrong_xp_per_difficulty",
            "battle_cost",
            "battle_wrong_health_per_difficulty",
            "practice_correct_health_restore",
        ):
            if getattr(self, name) < 0:
                raise ValueError(f"{name} cannot be negative")
        expected_rewards = MAX_DIFFICULTY - MIN_DIFFICULTY + 1
        if len(self.correct_xp_by_difficulty) != expected_rewards or any(
            reward < 0 for reward in self.correct_xp_by_difficulty
        ):
            raise ValueError(
                f"correct_xp_by_difficulty needs {expected_rewards} non-negative values"
            )
        if self.battle_question_count < 1:
            raise ValueError("battle_question_count must be at least 1")
        if not 1 <= self.battle_wins_required <= self.battle_question_count:
            raise ValueError(
                "battle_wins_required must be between 1 and battle_question_count"
            )
        if self.max_health < 1:
            raise ValueError("max_health must be at least 1")
        if not 0 <= self.starting_health <= self.max_health:
            raise ValueError("starting_health must be between 0 and max_health")
        if not 1 <= self.min_health_to_start_battle <= self.max_health:
            raise ValueError(
                "min_health_to_start_battle must be between 1 and max_health"
            )

    def correct_reward(self, difficulty: int) -> int:
        return self.correct_xp_by_difficulty[difficulty - MIN_DIFFICULTY]


DEFAULT_RULES = Rules()

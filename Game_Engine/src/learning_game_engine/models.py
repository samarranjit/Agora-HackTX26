"""Typed data structures for player progress and action results.

All classes are frozen: the engine produces a new PlayerState for every change,
so a state object handed to a caller can never be modified behind its back.
"""

from dataclasses import dataclass
from enum import StrEnum


class Scene(StrEnum):
    """Where the player currently is. Saved so a resumed game reopens there."""

    PLAYGROUND = "playground"
    LESSON = "lesson"
    PRACTICE = "practice"
    ADVENTURE = "adventure"
    BATTLE = "battle"


class AdventureStatus(StrEnum):
    LOCKED = "locked"
    UNLOCKED = "unlocked"
    COMPLETED = "completed"


class VillainStatus(StrEnum):
    COMPLETED = "completed"
    CURRENT = "current"
    LOCKED = "locked"


class BattleOutcome(StrEnum):
    IN_PROGRESS = "in progress"
    WON = "won"
    LOST = "lost"
    # Health reached zero, which ends the battle immediately as a loss.
    KNOCKED_OUT = "knocked out"


# --- Player progress (persisted by whoever hosts the engine) ---


@dataclass(frozen=True)
class QuestionRef:
    """What the engine needs to know about a question: its ID and difficulty.

    The difficulty always comes from the stored, validated question, never
    from the player's submission.
    """

    question_id: str
    difficulty: int


@dataclass(frozen=True)
class PendingAttempt:
    """A question that has been presented but not yet answered.

    attempt_id identifies this one presentation; question_id identifies the
    reusable content. The same question can be shown again later under a new
    attempt_id.
    """

    attempt_id: str
    question_id: str
    difficulty: int


@dataclass(frozen=True)
class ActiveBattle:
    """A paid battle that has not been resolved yet.

    position is the index of the question waiting for an answer, which is also
    how many questions have already been answered. pending_attempt_id stays the
    same when a battle is resumed, so the entry cost is not charged again.
    """

    villain_id: str
    battle_attempt_id: str
    questions: tuple[QuestionRef, ...]
    position: int
    correct_count: int
    pending_attempt_id: str

    @property
    def current_question(self) -> QuestionRef:
        return self.questions[self.position]

    @property
    def current_question_id(self) -> str:
        return self.current_question.question_id


@dataclass(frozen=True)
class PlayerState:
    """Everything needed to resume a game exactly where it was left."""

    player_name: str
    scene: Scene
    xp: int
    health: int
    adventure_unlocked: bool
    lesson_position: int
    lesson_completed: bool
    practice_position: int
    pending_practice: PendingAttempt | None
    completed_villains: tuple[str, ...]
    active_battle: ActiveBattle | None
    processed_attempt_ids: frozenset[str]


# --- Action results returned by the engine ---


@dataclass(frozen=True)
class PracticeResult:
    """Feedback after one practice answer. Deltas are the amounts applied."""

    correct: bool
    xp_delta: int
    xp: int
    health_delta: int
    health: int
    adventure_unlocked_now: bool


@dataclass(frozen=True)
class BattleResult:
    """Feedback after one battle answer.

    question_number is 1-based. outcome stays IN_PROGRESS until every question
    has been answered, unless health reaches zero first (KNOCKED_OUT). Deltas
    are the amounts actually applied after clamping at zero.
    """

    villain_id: str
    correct: bool
    xp_delta: int
    xp: int
    health_delta: int
    health: int
    question_number: int
    question_count: int
    correct_count: int
    outcome: BattleOutcome
    adventure_completed: bool

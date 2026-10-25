"""Game progression: which actions are allowed and how each one changes the state.

The engine performs no input/output, file access, database or network calls,
content loading, question selection, or answer grading. Callers pass in content
identifiers with each question's stored difficulty, and whether an answer was
correct; the engine decides what that means for XP, health, unlocks, and
battles.

Every action either raises InvalidAction without changing anything, or
replaces the whole state at once. Callers save `engine.state` after each
successful action.
"""

import uuid
from collections.abc import Sequence
from dataclasses import replace

from learning_game_engine.models import (
    ActiveBattle,
    AdventureStatus,
    BattleOutcome,
    BattleResult,
    PendingAttempt,
    PlayerState,
    PracticeResult,
    QuestionRef,
    Scene,
    VillainStatus,
)
from learning_game_engine.rules import DEFAULT_RULES, Rules, is_valid_difficulty


class InvalidAction(Exception):
    """The requested action is not allowed right now. The message is user-facing."""


class InvalidState(ValueError):
    """A PlayerState breaks one of the game's invariants."""


def _new_attempt_id() -> str:
    return uuid.uuid4().hex


def _require_boolean(correct: object) -> bool:
    """Reject anything except True or False.

    External graders may hand back strings or numbers. Truthiness is not
    enough: the string "false" is non-empty, so it would otherwise count as
    a correct answer and award XP.
    """
    if not isinstance(correct, bool):
        raise InvalidAction("A graded result must be true or false.")
    return correct


def _require_difficulty(difficulty: object) -> int:
    if not is_valid_difficulty(difficulty):
        raise InvalidAction("A question's difficulty must be a whole number 1-5.")
    assert isinstance(difficulty, int)
    return difficulty


class GameEngine:
    """Owns one player's progress and applies gameplay actions to it.

    slide_count and villain_ids describe the course layout; the engine needs
    them to track lesson progress and the order in which villains unlock.
    """

    def __init__(
        self,
        state: PlayerState,
        *,
        slide_count: int,
        villain_ids: Sequence[str],
        rules: Rules = DEFAULT_RULES,
    ) -> None:
        if slide_count < 1:
            raise ValueError("A course needs at least one slide")
        if not villain_ids or len(set(villain_ids)) != len(villain_ids):
            raise ValueError("villain_ids must be a non-empty list of unique IDs")
        self._slide_count = slide_count
        self._villain_ids = tuple(villain_ids)
        self._rules = rules
        validate_state(state, slide_count, self._villain_ids, rules)
        self._state = state

    @classmethod
    def new_game(
        cls,
        player_name: str,
        *,
        slide_count: int,
        villain_ids: Sequence[str],
        rules: Rules = DEFAULT_RULES,
    ) -> "GameEngine":
        """Start a fresh game in the playground.

        Raises InvalidAction if the name is blank.
        """
        name = player_name.strip()
        if not name:
            raise InvalidAction("Please enter a name.")
        state = PlayerState(
            player_name=name,
            scene=Scene.PLAYGROUND,
            xp=rules.starting_xp,
            health=rules.starting_health,
            adventure_unlocked=rules.starting_xp >= rules.unlock_threshold,
            lesson_position=0,
            lesson_completed=False,
            practice_position=0,
            pending_practice=None,
            completed_villains=(),
            active_battle=None,
            processed_attempt_ids=frozenset(),
        )
        return cls(state, slide_count=slide_count, villain_ids=villain_ids, rules=rules)

    # --- Read-only views ---

    @property
    def state(self) -> PlayerState:
        """The current state. It is immutable, so it is safe to hand out."""
        return self._state

    @property
    def rules(self) -> Rules:
        return self._rules

    @property
    def villain_ids(self) -> tuple[str, ...]:
        return self._villain_ids

    @property
    def adventure_completed(self) -> bool:
        return len(self._state.completed_villains) == len(self._villain_ids)

    @property
    def adventure_status(self) -> AdventureStatus:
        if self.adventure_completed:
            return AdventureStatus.COMPLETED
        if self._state.adventure_unlocked:
            return AdventureStatus.UNLOCKED
        return AdventureStatus.LOCKED

    @property
    def next_villain_id(self) -> str | None:
        """The only villain that can be battled next, or None when all are beaten."""
        completed = len(self._state.completed_villains)
        if completed == len(self._villain_ids):
            return None
        return self._villain_ids[completed]

    def villain_status(self, villain_id: str) -> VillainStatus:
        if villain_id not in self._villain_ids:
            raise InvalidAction(f"Unknown villain: {villain_id}")
        if villain_id in self._state.completed_villains:
            return VillainStatus.COMPLETED
        if villain_id == self.next_villain_id:
            return VillainStatus.CURRENT
        return VillainStatus.LOCKED

    @property
    def xp_to_unlock(self) -> int:
        """XP still needed to unlock adventure (0 once it is unlocked)."""
        if self._state.adventure_unlocked:
            return 0
        return max(0, self._rules.unlock_threshold - self._state.xp)

    @property
    def battle_shortfall(self) -> int:
        """XP still needed to pay for a battle (0 when affordable)."""
        return max(0, self._rules.battle_cost - self._state.xp)

    @property
    def health_shortfall(self) -> int:
        """Health still needed before a battle may start (0 when healthy enough)."""
        return max(0, self._rules.min_health_to_start_battle - self._state.health)

    # --- Actions ---

    def go_to(self, scene: Scene) -> None:
        """Move between the playground, lesson, practice, and adventure map.

        Battles are entered only through start_battle. Nothing else is
        reachable while a battle is unresolved.
        """
        if self._state.active_battle is not None:
            raise InvalidAction("Finish the current battle first.")
        if scene is Scene.BATTLE:
            raise InvalidAction("Start a battle from the adventure map.")
        if scene is Scene.ADVENTURE and not self._state.adventure_unlocked:
            raise InvalidAction(
                f"Adventure unlocks at {self._rules.unlock_threshold} XP. "
                f"Earn {self.xp_to_unlock} more XP in practice."
            )
        self._state = replace(self._state, scene=scene)

    def next_slide(self) -> bool:
        """Advance the lesson by one slide.

        Returns True when the last slide was just finished. The lesson then
        restarts at the first slide so it can be reviewed. Reading earns no XP.
        """
        self._require_scene(Scene.LESSON)
        position = self._state.lesson_position + 1
        if position < self._slide_count:
            self._state = replace(self._state, lesson_position=position)
            return False
        self._state = replace(self._state, lesson_position=0, lesson_completed=True)
        return True

    def present_practice_question(
        self, question_id: str, difficulty: int
    ) -> PendingAttempt:
        """Record that a practice question is being shown, under a fresh attempt ID.

        difficulty must come from the stored question. Raises InvalidAction if
        another practice question is still pending, so a saved question is
        never silently replaced.
        """
        self._require_scene(Scene.PRACTICE)
        level = _require_difficulty(difficulty)
        if self._state.pending_practice is not None:
            raise InvalidAction("Answer the current practice question first.")
        if not question_id:
            raise InvalidAction("A practice question needs an ID.")
        pending = PendingAttempt(
            attempt_id=_new_attempt_id(), question_id=question_id, difficulty=level
        )
        self._state = replace(self._state, pending_practice=pending)
        return pending

    def submit_practice_result(self, attempt_id: str, correct: bool) -> PracticeResult:
        """Apply a graded practice answer: XP reward, health restore, unlock.

        A correct answer earns XP by difficulty and restores some health (up to
        the maximum). A wrong answer changes neither XP nor health. `correct`
        must be a real boolean; other values are rejected before any change.
        """
        graded = _require_boolean(correct)
        self._require_scene(Scene.PRACTICE)
        pending = self._state.pending_practice
        if pending is None or pending.attempt_id != attempt_id:
            raise InvalidAction(self._unexpected_attempt_message(attempt_id))

        xp_delta = self._rules.correct_reward(pending.difficulty) if graded else 0
        xp = self._state.xp + xp_delta
        health = self._state.health
        if graded:
            health = min(
                self._rules.max_health,
                health + self._rules.practice_correct_health_restore,
            )
        unlocked_now = (
            not self._state.adventure_unlocked and xp >= self._rules.unlock_threshold
        )
        health_delta = health - self._state.health
        self._state = replace(
            self._state,
            xp=xp,
            health=health,
            adventure_unlocked=self._state.adventure_unlocked or unlocked_now,
            practice_position=self._state.practice_position + 1,
            pending_practice=None,
            processed_attempt_ids=self._state.processed_attempt_ids | {attempt_id},
        )
        return PracticeResult(
            correct=graded,
            xp_delta=xp_delta,
            xp=xp,
            health_delta=health_delta,
            health=health,
            adventure_unlocked_now=unlocked_now,
        )

    def start_battle(
        self, villain_id: str, questions: Sequence[QuestionRef]
    ) -> ActiveBattle:
        """Pay the entry cost and begin a new attempt against the next villain.

        questions is the full ordered list for this attempt, each with its
        stored difficulty. The first question is pending immediately, so a
        save can resume it without charging again.
        """
        self._require_scene(Scene.ADVENTURE)
        status = self.villain_status(villain_id)
        if status is VillainStatus.COMPLETED:
            raise InvalidAction("That villain has already been defeated.")
        if status is VillainStatus.LOCKED:
            raise InvalidAction("Defeat the earlier villains first.")
        refs = tuple(questions)
        if len(refs) != self._rules.battle_question_count or not all(
            ref.question_id for ref in refs
        ):
            raise InvalidAction(
                f"A battle needs exactly {self._rules.battle_question_count} questions."
            )
        for ref in refs:
            _require_difficulty(ref.difficulty)
        if self.health_shortfall > 0:
            raise InvalidAction(
                f"Your health is {self._state.health}. Answer practice questions "
                "correctly to recover health before starting a battle."
            )
        if self.battle_shortfall > 0:
            raise InvalidAction(
                f"A battle costs {self._rules.battle_cost} XP and you have "
                f"{self._state.xp}. Earn {self.battle_shortfall} more XP "
                "in practice."
            )

        battle = ActiveBattle(
            villain_id=villain_id,
            battle_attempt_id=_new_attempt_id(),
            questions=refs,
            position=0,
            correct_count=0,
            pending_attempt_id=_new_attempt_id(),
        )
        self._state = replace(
            self._state,
            scene=Scene.BATTLE,
            xp=self._state.xp - self._rules.battle_cost,
            active_battle=battle,
        )
        return battle

    def submit_battle_result(self, attempt_id: str, correct: bool) -> BattleResult:
        """Apply a graded battle answer.

        A correct answer earns XP by difficulty. A wrong answer costs XP and
        health by difficulty, each clamped at zero. If health reaches zero the
        battle ends at once as a loss (KNOCKED_OUT) and the player returns to
        the playground; the entry cost is not refunded. Otherwise every
        question is asked even when the outcome is already decided. Winning
        completes the villain; losing keeps the player at that villain.
        `correct` must be a real boolean.
        """
        graded = _require_boolean(correct)
        battle = self._state.active_battle
        if battle is None or battle.pending_attempt_id != attempt_id:
            raise InvalidAction(self._unexpected_attempt_message(attempt_id))

        difficulty = battle.current_question.difficulty
        if graded:
            xp = self._state.xp + self._rules.correct_reward(difficulty)
            health = self._state.health
        else:
            xp_loss = self._rules.battle_wrong_xp_per_difficulty * difficulty
            health_loss = self._rules.battle_wrong_health_per_difficulty * difficulty
            xp = max(0, self._state.xp - xp_loss)
            health = max(0, self._state.health - health_loss)
        xp_delta = xp - self._state.xp
        health_delta = health - self._state.health

        position = battle.position + 1
        correct_count = battle.correct_count + (1 if graded else 0)
        processed = self._state.processed_attempt_ids | {attempt_id}
        question_count = len(battle.questions)

        if health == 0:
            outcome = BattleOutcome.KNOCKED_OUT
            self._state = replace(
                self._state,
                scene=Scene.PLAYGROUND,
                xp=xp,
                health=health,
                active_battle=None,
                processed_attempt_ids=processed,
            )
        elif position < question_count:
            self._state = replace(
                self._state,
                xp=xp,
                health=health,
                active_battle=replace(
                    battle,
                    position=position,
                    correct_count=correct_count,
                    pending_attempt_id=_new_attempt_id(),
                ),
                processed_attempt_ids=processed,
            )
            outcome = BattleOutcome.IN_PROGRESS
        else:
            outcome = (
                BattleOutcome.WON
                if correct_count >= self._rules.battle_wins_required
                else BattleOutcome.LOST
            )
            completed = self._state.completed_villains
            if outcome is BattleOutcome.WON:
                completed = (*completed, battle.villain_id)
            self._state = replace(
                self._state,
                scene=Scene.ADVENTURE,
                xp=xp,
                health=health,
                active_battle=None,
                completed_villains=completed,
                processed_attempt_ids=processed,
            )

        return BattleResult(
            villain_id=battle.villain_id,
            correct=graded,
            xp_delta=xp_delta,
            xp=xp,
            health_delta=health_delta,
            health=health,
            question_number=position,
            question_count=question_count,
            correct_count=correct_count,
            outcome=outcome,
            adventure_completed=self.adventure_completed,
        )

    # --- Helpers ---

    def _require_scene(self, scene: Scene) -> None:
        if self._state.scene is not scene:
            raise InvalidAction(
                f"That action needs the {scene} scene, "
                f"but the player is in the {self._state.scene} scene."
            )

    def _unexpected_attempt_message(self, attempt_id: str) -> str:
        if attempt_id in self._state.processed_attempt_ids:
            return "That answer has already been processed."
        return "That answer does not match the question currently being asked."


def validate_state(
    state: PlayerState,
    slide_count: int,
    villain_ids: tuple[str, ...],
    rules: Rules,
) -> None:
    """Raise InvalidState if the state could not have been produced by the engine."""

    def check(condition: bool, message: str) -> None:
        if not condition:
            raise InvalidState(message)

    check(bool(state.player_name.strip()), "player name is blank")
    check(state.xp >= 0, "XP cannot be negative")
    check(
        0 <= state.health <= rules.max_health,
        "health must be between 0 and the maximum",
    )
    check(0 <= state.lesson_position < slide_count, "lesson position is out of range")
    check(state.practice_position >= 0, "practice position cannot be negative")
    check(
        state.xp < rules.unlock_threshold or state.adventure_unlocked,
        "XP reached the unlock threshold but adventure is locked",
    )

    completed = state.completed_villains
    check(
        completed == villain_ids[: len(completed)],
        "completed villains must be known and defeated in order",
    )
    check(
        not completed or state.adventure_unlocked,
        "villains were defeated while adventure is locked",
    )
    check(
        state.scene is not Scene.ADVENTURE or state.adventure_unlocked,
        "adventure scene while adventure is locked",
    )

    practice = state.pending_practice
    if practice is not None:
        check(bool(practice.attempt_id), "pending practice attempt has no ID")
        check(bool(practice.question_id), "pending practice question has no ID")
        check(
            is_valid_difficulty(practice.difficulty),
            "pending practice question has an invalid difficulty",
        )
        check(
            practice.attempt_id not in state.processed_attempt_ids,
            "pending practice attempt was already processed",
        )

    battle = state.active_battle
    check(
        (battle is None) == (state.scene is not Scene.BATTLE),
        "the battle scene and an active battle must go together",
    )
    if battle is None:
        return
    check(state.adventure_unlocked, "battle in progress while adventure is locked")
    check(state.health > 0, "a battle cannot continue at zero health")
    check(
        len(completed) < len(villain_ids)
        and battle.villain_id == villain_ids[len(completed)],
        "the active battle must be against the next undefeated villain",
    )
    check(bool(battle.battle_attempt_id), "battle attempt has no ID")
    check(
        len(battle.questions) == rules.battle_question_count
        and all(
            ref.question_id and is_valid_difficulty(ref.difficulty)
            for ref in battle.questions
        ),
        "the active battle has the wrong questions",
    )
    check(
        0 <= battle.position < len(battle.questions),
        "battle position is out of range",
    )
    check(
        0 <= battle.correct_count <= battle.position,
        "correct answers cannot exceed answered questions",
    )
    check(bool(battle.pending_attempt_id), "pending battle attempt has no ID")
    check(
        battle.pending_attempt_id not in state.processed_attempt_ids,
        "pending battle attempt was already processed",
    )
    check(
        practice is None or practice.attempt_id != battle.pending_attempt_id,
        "practice and battle attempts share an ID",
    )

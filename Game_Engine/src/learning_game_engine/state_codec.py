"""Convert a PlayerState to and from plain JSON-compatible dictionaries.

This is pure data conversion: no files, databases, or network. Anyone who stores
a player's state (for example the backend's database or a local save file)
uses it so every host agrees on the shape. state_from_dict checks structure
and types only; GameEngine re-checks the game's invariants on construction.
Referenced content IDs are not checked here because the engine owns no content.
"""

from collections.abc import Mapping

from learning_game_engine.models import (
    ActiveBattle,
    PendingAttempt,
    PlayerState,
    QuestionRef,
    Scene,
)
from learning_game_engine.rules import is_valid_difficulty

STATE_FORMAT_VERSION = 2


class StateCodecError(Exception):
    """The dictionary is not a valid serialized state. The message is safe to show."""


def state_to_dict(state: PlayerState) -> dict[str, object]:
    battle = state.active_battle
    return {
        "format_version": STATE_FORMAT_VERSION,
        "player_name": state.player_name,
        "scene": state.scene.value,
        "xp": state.xp,
        "health": state.health,
        "adventure_unlocked": state.adventure_unlocked,
        "lesson_position": state.lesson_position,
        "lesson_completed": state.lesson_completed,
        "practice_position": state.practice_position,
        "pending_practice": _pending_to_dict(state.pending_practice),
        "completed_villains": list(state.completed_villains),
        "active_battle": None
        if battle is None
        else {
            "villain_id": battle.villain_id,
            "battle_attempt_id": battle.battle_attempt_id,
            "questions": [
                {"question_id": ref.question_id, "difficulty": ref.difficulty}
                for ref in battle.questions
            ],
            "position": battle.position,
            "correct_count": battle.correct_count,
            "pending_attempt_id": battle.pending_attempt_id,
        },
        "processed_attempt_ids": sorted(state.processed_attempt_ids),
    }


def _pending_to_dict(pending: PendingAttempt | None) -> dict[str, object] | None:
    if pending is None:
        return None
    return {
        "attempt_id": pending.attempt_id,
        "question_id": pending.question_id,
        "difficulty": pending.difficulty,
    }


_STATE_FIELDS = frozenset(
    {
        "format_version",
        "player_name",
        "scene",
        "xp",
        "health",
        "adventure_unlocked",
        "lesson_position",
        "lesson_completed",
        "practice_position",
        "pending_practice",
        "completed_villains",
        "active_battle",
        "processed_attempt_ids",
    }
)
_PENDING_FIELDS = frozenset({"attempt_id", "question_id", "difficulty"})
_QUESTION_REF_FIELDS = frozenset({"question_id", "difficulty"})
_BATTLE_FIELDS = frozenset(
    {
        "villain_id",
        "battle_attempt_id",
        "questions",
        "position",
        "correct_count",
        "pending_attempt_id",
    }
)


def state_from_dict(data: object) -> PlayerState:
    """Convert decoded version 2 JSON into a PlayerState, checking structure and types.

    Raises StateCodecError. Game invariants are checked separately by GameEngine.
    """
    if not isinstance(data, dict):
        raise StateCodecError("The state must be a JSON object.")
    version = data.get("format_version")
    if version != STATE_FORMAT_VERSION:
        raise StateCodecError(
            f"Unsupported state format version {version!r} "
            f"(expected version {STATE_FORMAT_VERSION})."
        )
    _check_fields(data, _STATE_FIELDS, "save")

    scene_value = _str(data, "scene")
    try:
        scene = Scene(scene_value)
    except ValueError:
        raise StateCodecError(f"Unknown scene {scene_value!r}.") from None

    xp = _int(data, "xp")
    if xp < 0:
        raise StateCodecError("XP cannot be negative.")

    return PlayerState(
        player_name=_str(data, "player_name"),
        scene=scene,
        xp=xp,
        health=_int(data, "health"),
        adventure_unlocked=_bool(data, "adventure_unlocked"),
        lesson_position=_int(data, "lesson_position"),
        lesson_completed=_bool(data, "lesson_completed"),
        practice_position=_int(data, "practice_position"),
        pending_practice=_pending_from_dict(data["pending_practice"]),
        completed_villains=tuple(_str_list(data, "completed_villains")),
        active_battle=_battle_from_dict(data["active_battle"]),
        processed_attempt_ids=frozenset(_str_list(data, "processed_attempt_ids")),
    )


def _pending_from_dict(value: object) -> PendingAttempt | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise StateCodecError("'pending_practice' must be an object or null.")
    _check_fields(value, _PENDING_FIELDS, "pending_practice")
    return PendingAttempt(
        attempt_id=_str(value, "attempt_id"),
        question_id=_str(value, "question_id"),
        difficulty=_difficulty(value),
    )


def _battle_from_dict(value: object) -> ActiveBattle | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise StateCodecError("'active_battle' must be an object or null.")
    _check_fields(value, _BATTLE_FIELDS, "active_battle")
    raw_questions = value["questions"]
    if not isinstance(raw_questions, list):
        raise StateCodecError("'questions' must be a list.")
    questions = []
    for item in raw_questions:
        if not isinstance(item, dict):
            raise StateCodecError("Each battle question must be an object.")
        _check_fields(item, _QUESTION_REF_FIELDS, "battle question")
        questions.append(QuestionRef(_str(item, "question_id"), _difficulty(item)))
    return ActiveBattle(
        villain_id=_str(value, "villain_id"),
        battle_attempt_id=_str(value, "battle_attempt_id"),
        questions=tuple(questions),
        position=_int(value, "position"),
        correct_count=_int(value, "correct_count"),
        pending_attempt_id=_str(value, "pending_attempt_id"),
    )


def _difficulty(data: Mapping[str, object]) -> int:
    value = data["difficulty"]
    if not is_valid_difficulty(value):
        raise StateCodecError("'difficulty' must be a whole number from 1 to 5.")
    assert isinstance(value, int)
    return value


def _check_fields(
    data: Mapping[str, object], expected: frozenset[str], where: str
) -> None:
    missing = expected - data.keys()
    if missing:
        raise StateCodecError(
            f"The {where} is missing fields: {', '.join(sorted(missing))}."
        )
    unexpected = data.keys() - expected
    if unexpected:
        raise StateCodecError(
            f"The {where} has unexpected fields: {', '.join(sorted(unexpected))}."
        )


def _str(data: Mapping[str, object], key: str) -> str:
    value = data[key]
    if not isinstance(value, str):
        raise StateCodecError(f"'{key}' must be a string.")
    return value


def _int(data: Mapping[str, object], key: str) -> int:
    value = data[key]
    # bool is a subclass of int in Python, so exclude it explicitly.
    if isinstance(value, bool) or not isinstance(value, int):
        raise StateCodecError(f"'{key}' must be a whole number.")
    return value


def _bool(data: Mapping[str, object], key: str) -> bool:
    value = data[key]
    if not isinstance(value, bool):
        raise StateCodecError(f"'{key}' must be true or false.")
    return value


def _str_list(data: Mapping[str, object], key: str) -> list[str]:
    value = data[key]
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise StateCodecError(f"'{key}' must be a list of strings.")
    return value

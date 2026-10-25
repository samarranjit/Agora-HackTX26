# Game Engine: folder structure and code guide

A tour of the engine package for someone new to it. Usage is in [README.md](README.md); the
HTTP service that hosts it is in [../backend/](../backend/).

## Purpose

The engine decides **what is allowed and what each action does**. It is deliberately small and
pure: it never prints, reads files, opens a database, makes a network call, or grades a raw
answer. Hosts pass in content IDs, a question's stored difficulty, and a real `true`/`false`
for "was it right"; the engine returns a new immutable state and a result.

| Term | Meaning |
|---|---|
| State | Everything about one player now: XP, health, location, battle in progress. A `PlayerState`. |
| Action | A method on `GameEngine`, such as `start_battle`. |
| Transition | The change an action makes. A disallowed action raises `InvalidAction` and changes nothing. |
| Attempt | One presentation of one question, answerable once, with a unique ID. A *battle attempt* is one paid try at a villain. |

## Files

```text
Game_Engine/
├── pyproject.toml            name learning-game-engine, dependencies = [], uv_build, Ruff, strict mypy
├── uv.lock                   (generated, committed) only Ruff, mypy and their dependencies
├── README.md  FOLDER_STRUCTURE.md
├── src/learning_game_engine/
│   ├── __init__.py           docstring only
│   ├── rules.py              Rules, DEFAULT_RULES, difficulty scale (1-5), is_valid_difficulty
│   ├── models.py             enums and frozen dataclasses
│   ├── engine.py             GameEngine, InvalidAction, InvalidState, validate_state
│   ├── state_codec.py        state_to_dict, state_from_dict, StateCodecError, STATE_FORMAT_VERSION
│   └── py.typed              marks the package as typed
└── tests/                    test_engine.py, test_rules.py, test_models.py, test_state_codec.py
```

Generated and ignored: `.venv/`, `.mypy_cache/`, `.ruff_cache/`, `__pycache__/`, `dist/`.

## Module reference

| Module | Responsibility | Key names | State / I/O | Imports |
|---|---|---|---|---|
| `rules.py` | Every tunable number, validated at construction | `Rules` (`correct_xp_by_difficulty`, `battle_cost`, `unlock_threshold`, `max_health`, penalties per difficulty, `min_health_to_start_battle`, ...), `correct_reward()` | none / none | nothing |
| `models.py` | Shapes shared with hosts | `Scene`, `AdventureStatus`, `VillainStatus`, `BattleOutcome` (`KNOCKED_OUT`), `QuestionRef`, `PendingAttempt`, `ActiveBattle`, `PlayerState`, `PracticeResult`, `BattleResult` | frozen / none | nothing |
| `engine.py` | Actions and invariants | `GameEngine.new_game`, `go_to`, `next_slide`, `present_practice_question`, `submit_practice_result`, `start_battle`, `submit_battle_result`; views `xp_to_unlock`, `battle_shortfall`, `health_shortfall`, `next_villain_id` | replaces state / none | `models`, `rules` |
| `state_codec.py` | State <-> plain dict (host stores it) | `state_to_dict`, `state_from_dict` | none / none | `models`, `rules` |

## How an action works

`submit_battle_result(attempt_id, correct)` as an example:

1. Reject a non-`bool` `correct`, and an `attempt_id` that is not the battle's pending one
   (`InvalidAction`, with a different message if it was already processed).
2. Look up the current question's stored difficulty.
3. Correct: add `rules.correct_reward(difficulty)` XP. Wrong: subtract
   `battle_wrong_xp_per_difficulty * difficulty` XP and
   `battle_wrong_health_per_difficulty * difficulty` health, each clamped at zero.
4. If health is zero the battle ends immediately (`KNOCKED_OUT`), the scene becomes the
   playground, and the entry fee is not refunded. Otherwise ask the next question; after the
   last one, win (enough correct answers) or lose.
5. Build one new `PlayerState` and return a `BattleResult` whose deltas are the amounts
   actually applied.

Nothing changes unless every check passed.

## Invariants

See "Invariants" in the [README](README.md). `GameEngine(state, ...)` runs `validate_state`
every time, so a corrupted stored state is refused instead of played.

## Dependency direction

`engine` → `models`, `rules`; `state_codec` → `models`, `rules`. The engine package imports
nothing outside the standard library, and two tests enforce it: importing it loads no web,
database, HTTP, PDF, or authentication modules, and `pyproject.toml` declares no runtime
dependencies.

## Common changes

| Change | Where |
|---|---|
| XP rewards, penalties, battle cost, unlock threshold, health values | `rules.py`; update expected totals in `test_engine.py` |
| Difficulty scale | `MIN_DIFFICULTY`/`MAX_DIFFICULTY` and the reward table length in `rules.py` (also the backend's schemas and RAG validation, which check 1-5) |
| A new rule in an action | the method in `engine.py`, a new invariant if state must stay consistent, a focused test |
| A new persisted field | `PlayerState`, `new_game`, `validate_state`, `state_codec.py` (bump `STATE_FORMAT_VERSION`), then every host's stored data |

## Testing

```sh
uv run python -m unittest discover -s tests -v
```

Tests are fast and touch no files, databases, or network. To test a rule change, build an
engine with custom rules rather than editing the defaults, using the helpers at the top of
`test_engine.py`:

```python
engine = new_engine(Rules(battle_cost=50))
earn(engine, 100)
start_next_battle(engine)
assert engine.state.xp == 50
```

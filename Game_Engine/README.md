# Agora — Game Engine

Pure rules for Agora: XP, health, unlock, villain order, paid battles, attempt tracking. No web stack, database, HTTP, PDFs, or RAG. The backend supplies questions and a true/false grade; this package decides what that means.

Deeper tour: [FOLDER_STRUCTURE.md](FOLDER_STRUCTURE.md).

## Owns

Player state, XP/health math, adventure unlock, battle entry and attempts, applying an already-graded outcome, duplicate-attempt protection, dict serialization.

Does **not** own routes, accounts, PDFs, grading of raw answers, or CORS.

## Use

```python
from learning_game_engine.engine import GameEngine
from learning_game_engine.models import Scene

engine = GameEngine.new_game("Ada", slide_count=3, villain_ids=["a", "b", "c"])
engine.go_to(Scene.PRACTICE)
pending = engine.present_practice_question("q-1", difficulty=3)
result = engine.submit_practice_result(pending.attempt_id, correct=True)
```

Invalid actions raise `InvalidAction` and change nothing. Package name remains `learning-game-engine`.

## Layout

```text
Game_Engine/
├── pyproject.toml
├── src/learning_game_engine/
│   ├── rules.py          XP table, health, costs
│   ├── models.py         frozen state and results
│   ├── engine.py         actions and validate_state
│   └── state_codec.py    PlayerState ↔ dict
└── tests/                no files, network, or database
```

```sh
uv sync --locked
uv run python -m unittest discover -s tests -v
uv run ruff check .
uv run mypy src
```

# Agora — Backend

FastAPI service the frontend talks to. Accounts, PDF intake, game-master client, grading, and SQLite. For gameplay it loads state, calls **one** `Game_Engine` action, and saves atomically. It has no progression rules of its own.

```text
Frontend ── bearer token ──▶ Backend ── RAG contract ──▶ ai_module
                               └── imports Game_Engine
```

Start here: [CHEATSHEET.md](CHEATSHEET.md). Full notes: [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md). Spec: [contracts/openapi.json](contracts/openapi.json) (`/docs` when running).

## Run

```sh
uv sync --locked
cp .env.example .env
uv run --env-file .env learning-game-api serve    # http://127.0.0.1:8000
```

### Study packs and the game master

`POST /api/study-packs` takes a PDF in one call. The backend stores it, has `ai_module` index it, and writes a practice set (default 10 questions) and an adventure set (exactly difficulties 1, 3 and 5, one per guardian). `GET /api/study-packs/{id}` reports `indexing → writing_questions → done`; a failed pack must be uploaded again.

In `.env` (git-ignored): `GAME_MASTER_MODE=http`, `GAME_MASTER_URL` (the port `ai_module` listens on, 9100 where 9000 is taken), `GAME_MASTER_API_KEY` (the same secret as the service's `RAG_API_KEY`), `GAME_MASTER_TIMEOUT_SECONDS=300`, and `LEARNING_GAME_CORS_ORIGINS` (exact origins, no wildcard). A running backend keeps the settings it started with, so **restart it after editing `.env`**. "The game master could not be reached" means the URL points at nothing, or at another program.

For a free ngrok tunnel the API allows the `ngrok-skip-browser-warning` header in CORS.

### Deploy on Render

[`render.yaml`](../render.yaml) at the repository root is a Render Blueprint (Dashboard → New → Blueprint). It builds `backend/Dockerfile` from the repository root, checks `/healthz`, and asks for `GAME_MASTER_URL`, `GAME_MASTER_API_KEY` and `LEARNING_GAME_CORS_ORIGINS` on the first deploy. `serve` listens on `$PORT` when it is set. The free plan has no disk, so data in `/data` is lost on each deploy.

Commands: `serve`, `migrate`, `openapi FILE`. Package name remains `learning-game-backend`; CLI remains `learning-game-api`.

```sh
uv run python -m unittest discover -s tests -v
uv run ruff check .
uv run mypy src
```

## Layout

```text
backend/
├── pyproject.toml
├── src/learning_game_backend/
│   ├── main.py                 serve / migrate / openapi
│   ├── config.py               environment settings
│   ├── api/                    FastAPI app, routes, schemas
│   ├── application/            game_service.py, campaign.py
│   ├── persistence/            SQLite, migrations, queries
│   ├── auth/                   accounts and session tokens
│   ├── grading/                answer evaluation
│   ├── documents/              PDF storage
│   └── rag/                    game-master client and validation
├── tests/                      unit, contract, integration
└── contracts/                  OpenAPI, frontend-api, rag-contract
```

`api` → `application` → persistence / auth / grading / documents / rag / engine. Generated questions become playable only through `rag/validation.py`.

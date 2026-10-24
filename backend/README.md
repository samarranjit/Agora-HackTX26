# Learning Game Backend

The HTTP API the frontend talks to. It owns accounts, PDF intake, the game master (RAG)
client, validation of everything the game master returns, grading, SQLite persistence,
transactions, idempotency, and deployment configuration. For gameplay it loads a player's state,
calls **one** action on the [Game Engine](../Game_Engine/), and saves the result atomically.
It contains no progression rules of its own.

- **Start here if you build the frontend or the RAG service:** [CHEATSHEET.md](CHEATSHEET.md)
- Details: [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md),
  [contracts/frontend-api.md](contracts/frontend-api.md),
  [contracts/rag-contract.md](contracts/rag-contract.md)
- Machine-readable API: [contracts/openapi.json](contracts/openapi.json); live docs at `/docs`

This repository contains two Python projects: `backend/` (this one) and
[`Game_Engine/`](../Game_Engine/), the pure rules package it depends on by local path. The
frontend and the RAG pipeline are developed separately and talk to the backend over HTTP.

```text
Frontend ──HTTPS + bearer token──▶ Backend ──HTTP (RAG contract v1)──▶ RAG / game master
                                     │
                                     └── imports Game_Engine (pure rules, no I/O)
```

- The frontend calls only the backend and never computes XP, health, costs, unlocks, or outcomes.
- The RAG service never changes player state and never decides rewards or progression.
- The engine imports nothing outside the Python standard library.

> No real game master exists yet. Until one is connected, uploads and generation return
> HTTP 503, unless you explicitly set `GAME_MASTER_MODE=fake` (demo questions that are **not**
> generated from the PDF).

## Game rules

The rules are implemented only in the engine
([`../Game_Engine/src/learning_game_engine/rules.py`](../Game_Engine/src/learning_game_engine/rules.py));
the backend applies them and never duplicates them. XP is a single balance shared by
practice and adventure.

| Rule | Value |
|---|---|
| Starting XP / health | 0 XP, 100 health (maximum 100) |
| Correct answer at difficulty 1 / 2 / 3 / 4 / 5 | +10 / 15 / 20 / 25 / 30 XP (practice and battles) |
| Wrong practice answer | no change to XP or health |
| Correct practice answer | also restores 5 health, up to the maximum |
| Adventure unlocks at | 100 XP, permanently |
| Battle entry | 30 XP, charged once when the battle starts |
| Wrong battle answer | −2 × difficulty XP and −5 × difficulty health (neither below 0) |
| Questions per battle / needed to win | 3 / 2 |
| Health reaches 0 | The battle ends at once as a loss (`knocked_out`), the player returns to the playground, the entry fee is not refunded, and practice is needed to recover health first |
| Winning | Completes the villain and opens the next one (no bonus XP) |
| Villains | Forest Goblin → Bridge Troll → Castle Dragon, in order |

Difficulty is a whole number from 1 to 5 and always comes from the stored question. These
values are initial product choices; an earlier prototype used a fixed +20 points with no
health, and whether to keep the current economy is still an open product decision.

## Run locally

```sh
cd backend
uv sync --locked
cp .env.example .env            # edit; .env is git-ignored
uv run --env-file .env learning-game-api serve          # http://127.0.0.1:8000
```

Commands: `learning-game-api serve [--host H] [--port P]`, `migrate` (create/upgrade the
database; also done at startup), `openapi FILE` (write the API description; the committed copy is `contracts/openapi.json`, and a test fails if it is stale).

## Layout

```text
backend/src/learning_game_backend/
├── main.py                       command line (serve / migrate / openapi)
├── config.py                     Settings from environment variables, validated
├── api/
│   ├── app.py                    create_app(): middleware, routers, startup
│   ├── dependencies.py           service, settings, current player, Idempotency-Key
│   ├── errors.py                 the single {"error": {...}} shape
│   ├── schemas.py                request/response models (what may leave the server)
│   └── routes/{auth,documents,questions,gameplay}.py
├── application/
│   ├── game_service.py           one transaction per action; the only place that combines
│   │                             persistence, RAG content, grading, and engine transitions
│   └── campaign.py               villain order/names and lesson length given to the engine
├── persistence/                  database.py (connections, transactions), migrations.py,
│                                 repositories.py (shared queries)
├── auth/service.py               accounts, Argon2 passwords, session tokens
├── grading/evaluator.py          grade answers with the private keys
├── documents/storage.py          PDF validation and safe storage
└── rag/                          protocol, schemas, validation, http_client, fake_provider
```

Dependencies point one way: `api` → `application` → (`persistence`, `auth`, `grading`,
`documents`, `rag`, and the engine package). `rag/validation.py` is the only way generated
content becomes playable.

## Configuration

All settings come from environment variables; see [.env.example](.env.example) and the table in
the integration guide. Invalid values stop startup with `Configuration error: ...` (exit
code 2). In particular `LEARNING_GAME_CORS_ORIGINS` must list **exact** origins
(`https://app.example.com`); `*` and paths are rejected, and no origin is allowed by default.
`GAME_MASTER_API_KEY` is never logged and is excluded from settings output.

## Database

SQLite file `learning_game.sqlite3` plus a `documents/` folder of stored PDFs, both under
`LEARNING_GAME_DATA_DIR`. The schema version is `PRAGMA user_version`; numbered migrations are
in `persistence/migrations.py` (append new ones, never edit old ones). Every state-changing
request is one `BEGIN IMMEDIATE` transaction.

## Docker

Build from the **repository root** (the backend depends on `../Game_Engine`):

```sh
docker build -f backend/Dockerfile -t learning-game-backend .
docker run --rm -p 8000:8000 -v learning-game-data:/data \
  --env-file backend/.env \
  -e LEARNING_GAME_CORS_ORIGINS=https://app.example.com \
  learning-game-backend
```

The image uses uv with `--locked --no-dev --no-editable`, a multi-stage build, a non-root
user (uid 10001), and `/data` as the volume for the database and PDFs. No secrets are baked
in; pass them at run time. It has a `HEALTHCHECK` on `GET /healthz`. `backend/Dockerfile.dockerignore`
keeps `.env`, `var/`, saves, tests, and other projects out of the build context.

**The Dockerfile has not been built in this repository's verification** (the Docker daemon was
not available). Its install step was verified separately by running the same
`uv sync --locked --no-dev --no-editable` over the same layout in a scratch directory and
starting the server from the result.

Put HTTPS in front of it (a reverse proxy or your platform's load balancer); bearer tokens
and answers must not travel over plain HTTP.

## Operational limits

This is a single-instance design. State plainly:

- **One container, one durable volume.** SQLite with write-ahead logging on one host. Do not
  run two instances against the same volume, and do not use network filesystems.
- **Not horizontally scalable.** Ingestion and generation run as in-process background
  tasks. A restart marks unfinished jobs as failed ("Interrupted by a server restart") and
  the player resubmits; there is no queue and no automatic retry. A second process starting
  on the same data would also mark the first one's running jobs as failed.
- **Provider calls block a worker thread** for up to `GAME_MASTER_TIMEOUT_SECONDS`.
- **No rate limiting, account lockout, password reset, or email verification.** Add rate
  limiting at the proxy, at least for `/api/auth/*`.
- **Back up** the data volume (database and `documents/`) while the server is stopped, or use
  SQLite's online backup.
- Documents and question sets cannot be deleted through the API.

### What replaces these later (not implemented)

Moving past one instance would mean a server database such as PostgreSQL (the SQL here is
plain and the access is concentrated in `persistence/` and `application/game_service.py`),
an external job queue and workers for ingestion and generation, shared object storage for PDFs,
and database-level locking or `SELECT ... FOR UPDATE` in place of `BEGIN IMMEDIATE`. None of
that has been added; it needs a decision first.

## Checks

```sh
uv sync --locked
uv run python -m unittest discover -s tests -v
uv run ruff check .
uv run ruff format --check .
uv run mypy src
```

Tests (`tests/unit`, `tests/contract`, `tests/integration`) use temporary databases and the
fake or scripted providers; no credentials or network are needed.

# Integration Guide

For people connecting a **game master** (PDF ingestion, retrieval, question generation) or
a **frontend** to the backend API. A one-page summary is [CHEATSHEET.md](CHEATSHEET.md).
Setup, rules, and deployment are in [README.md](README.md). The exact wire formats are in
[contracts/rag-contract.md](contracts/rag-contract.md) and
[contracts/frontend-api.md](contracts/frontend-api.md); the machine-readable API is
[contracts/openapi.json](contracts/openapi.json).

Contents: [1 Status](#1-what-is-and-is-not-connected) · [2 Architecture](#2-architecture) ·
[3 Configuration](#3-configuration) · [4 Game master contract](#4-game-master-contract) ·
[5 Document flow](#5-pdf-and-generation-flow) · [6 API](#6-api-reference) ·
[7 Auth](#7-authentication-and-sessions) · [8 Rules](#8-xp-and-health-rules) ·
[9 Consistency](#9-concurrency-and-idempotency) · [10 Frontend](#10-building-a-frontend) ·
[11 Persistence vs compression](#11-persistence-authentication-transactions-compression) ·
[12 Database](#12-database-and-migrations) · [13 Dummy vs real](#13-dummy-mode-versus-real-rag-mode) ·
[14 Deployment](#14-deployment-notes) · [15 Local saves](#15-local-saves-from-other-tools) ·
[16 End to end](#16-end-to-end-example) · [17 Limitations](#17-remaining-limitations) ·
[18 Checks](#18-running-all-checks)

## 1. What is and is not connected

| Piece | Status |
|---|---|
| Gemini game master | `ai_module/service.py` in this repository implements the contract on top of the Gemini File Search pipeline. See `ai_module/SERVICE.md`. |
| HTTP client for a game master | Implemented (`HttpGameMaster`). Tested against a mock transport, and run end to end against the `ai_module` service with Gemini replaced by a stand-in. |
| Contract validation of its output | Implemented and tested (`validate_generated_set`). |
| Real PDF ingestion and question generation by Gemini | **Not exercised by this project's tests.** Requires a Gemini API key and a run of `ai_module.service`. |
| `fake` provider | Implemented for tests and explicit demos. Its questions ignore the PDF. |

To use the Gemini service, run it (`python -m ai_module.service`, see `ai_module/SERVICE.md`)
and start this server with `GAME_MASTER_MODE=http`, `GAME_MASTER_URL=http://127.0.0.1:9000`,
`GAME_MASTER_API_KEY=<the service's RAG_API_KEY>`, and `GAME_MASTER_TIMEOUT_SECONDS=300`
(indexing a large PDF can take longer than the 60 second default). To use a different game
master, implement section 4 and set the same variables. If it is instead a Python library in this repository,
add an adapter class with the same two methods as `HttpGameMaster` (see `GameMaster` in
`rag/protocol.py`) and select it in `build_game_master` in `api/app.py`. No `sys.path` changes
are needed if it is a normal uv path dependency.

## 2. Architecture

```text
Frontend (React / Three.js)
        │  HTTPS, bearer token
   api/            routes, schemas, errors: authenticate, validate, shape responses
        │
   application/game_service.py   one DB transaction per action
   ├── rag/            protocol, HTTP client, fake provider, validation of output
   ├── grading/        grade answers with private keys
   ├── documents/      PDF checks and safe file storage
   ├── auth/           accounts and sessions
   ├── persistence/    SQLite, transactions, migrations, small queries
   └── learning_game_engine   (separate package) XP, health, unlocks, battles
```

The `learning_game_engine` package (in `../Game_Engine`) does no HTTP, database, or RAG calls and
never grades. `application/game_service.py` is the only place that combines the engine with
persistence, grading, and RAG content.

## 3. Configuration

Environment variables only (see `.env.example`; nothing is read from a file automatically,
use `uv run --env-file .env ...`). Secrets never go in source control or logs; the API key
is excluded from `repr(Settings)`.

| Variable | Default | Meaning |
|---|---|---|
| `GAME_MASTER_MODE` | `disabled` | `disabled`, `http`, or `fake` |
| `GAME_MASTER_URL` | – | Base URL of the game master (required for `http`) |
| `GAME_MASTER_API_KEY` | – | Sent as `Authorization: Bearer ...` to the game master |
| `GAME_MASTER_TIMEOUT_SECONDS` | `60` | Per-request timeout; a timeout fails the job with a clear message |
| `LEARNING_GAME_DATA_DIR` | `backend/var` (container: `/data`) | SQLite database and `documents/` PDF store |
| `LEARNING_GAME_MAX_UPLOAD_BYTES` | 20 MiB | PDF size limit (HTTP 413 above it) |
| `LEARNING_GAME_SESSION_TTL_HOURS` | `168` | Login session lifetime |
| `LEARNING_GAME_ALLOW_REGISTRATION` | `true` | Set `false` to close sign-up |
| `LEARNING_GAME_CORS_ORIGINS` | none | Comma-separated **exact** frontend origins such as `https://app.example.com`. Wildcards (`*`) and paths are rejected at startup |
| `LEARNING_GAME_GZIP_MINIMUM_BYTES` | `1000` | Smaller responses are not compressed |

Game rules (XP table, health, costs) are in the engine's `rules.py` (`Game_Engine/src/learning_game_engine/rules.py`), not the environment. Invalid settings stop startup with a `Configuration error:` message and exit code 2.

## 4. Game master contract

The server calls two endpoints on `GAME_MASTER_URL`. Authentication: `Authorization:
Bearer <GAME_MASTER_API_KEY>` when a key is configured. All responses are JSON.

### `POST /v1/documents` (multipart form)

Fields: `file` (the PDF) and `document_id` (a server-generated 32-hex string). Ingest the
PDF and return when it is searchable. The server waits up to the configured timeout.

```json
{ "status": "ready" }
{ "status": "failed", "error": "The PDF contains only scanned images." }
```

Any other status, an HTTP error, or a timeout marks the document `failed`.

### `POST /v1/question-sets` (JSON)

Request:

```json
{
  "contract_version": 1,
  "question_set_id": "0f3c...32 hex",
  "document_ids": ["a1b2...32 hex"],
  "topic": "Mitochondria",
  "mode": "practice",
  "count": 5,
  "difficulty_min": 1,
  "difficulty_max": 5
}
```

The game master **must retrieve only from the listed `document_ids`**; the server has
already checked that the player owns them. Return at most `count` questions:

```json
{
  "schema_version": 1,
  "generation": { "model": "gpt-x", "prompt_version": "p7", "pipeline_version": "2.1" },
  "questions": [
    {
      "id": "q-001",
      "type": "numeric",
      "mode": "practice",
      "topic": "Mitochondria",
      "learning_objective": "Count chromosomes",
      "prompt": "How many chromosomes does a human cell contain?",
      "answer": { "value": 46 },
      "grading": { "tolerance": 0 },
      "explanation": "Humans have 23 pairs of chromosomes.",
      "difficulty": 3,
      "sources": [{ "document_id": "a1b2...", "pages": [4, 5] }]
    },
    {
      "id": "q-002",
      "type": "multiple_choice",
      "prompt": "Which organelle makes most ATP?",
      "options": [{ "id": "A", "text": "Nucleus" }, { "id": "B", "text": "Mitochondrion" }],
      "answer": { "option_id": "B" },
      "explanation": "Mitochondria produce most of the cell's ATP.",
      "difficulty": 2
    }
  ]
}
```

| Field | Rule |
|---|---|
| `schema_version` | Must equal `1` |
| `questions[].id` | Required, unique within the set, ≤200 chars. Stored as `source_question_id`; the server assigns its own stable question ID |
| `type` | `numeric` or `multiple_choice`; anything else rejects the set |
| `mode` | Optional; if present must equal the requested mode |
| `prompt`, `explanation` | Required non-empty strings, ≤4000 chars |
| `difficulty` | Whole number 1–5 (booleans, floats, strings are rejected) |
| `answer` | `{"value": number}` for numeric (finite; numbers or numeric strings), `{"option_id": ...}` for multiple choice (must match an option) |
| `grading.tolerance` | Optional, ≥0, numeric only; default 0 (exact) |
| `options` | Multiple choice: 2–6 items, unique ids of 1–32 letters/digits/`_`/`-` |
| `sources[].document_id` | Must be one of the requested documents |
| `sources[].pages` | Optional positive integers. **If omitted, the API returns an empty list; it never invents pages** |
| `generation` | Only `provider_question_set_id`, `model`, `prompt_version`, `pipeline_version`, `generated_at` are kept (≤200 chars each) |

Any violation rejects the **whole set**: it is marked `failed` with a message naming the
first problem, and nothing from it becomes playable. Unknown fields (for example
`"xp_reward": 10000`) are ignored: rewards come from the engine's `rules.py` only. Prompts and
explanations are stored and displayed as plain text; the server never executes them.
Treat PDF text as data inside the pipeline; the server cannot make it safe for you.

Errors: respond with HTTP ≥400 and optionally `{"error": "short message"}`. The text is
shown to the player, truncated to 200 characters; a missing or non-text value is replaced
by a generic message. Raw response bodies, URLs, and keys are never forwarded, so keep
your `error` text safe to show to end users.

## 5. PDF and generation flow

**Recommended: the study pack.** `POST /api/study-packs` (multipart `file`, optional `topic` and
`practice_count`) does every step below in one request. It validates and stores the PDF, then
returns `202` immediately. In the background the server (1) sends the PDF to the game master,
(2) creates a practice set (`practice_count` questions, difficulty 1-5) and an adventure set
(3 questions for the 3 villains, at exactly their difficulties 1, 3 and 5), (3) writes both at the
same time, (4) checks the adventure set really has each villain's level, and (5) marks the pack
`ready`. Poll `GET /api/study-packs/{document_id}` for `status` and `stage`
(`indexing` -> `writing_questions` -> `done`, or `failed` with an `error`). A pack is `failed`
if indexing fails, either set fails, or the adventure set is missing a required difficulty
(the practice set stays usable). The pack's state is stored in the `study_packs` table
(migration 2), so a restart marks an unfinished pack `failed` instead of leaving it stuck.
The lower-level steps follow; use them directly only for custom sets.

1. `POST /api/documents` (multipart `file`). The server checks size, the `%PDF-` header,
   that pypdf can open it, that it is not encrypted, and that it has pages. The filename
   and `Content-Type` are never trusted. Errors: `too_large` (413), `empty_file`,
   `not_a_pdf`, `malformed_pdf`, `encrypted_pdf`, `empty_pdf` (all 422).
2. The file is stored as `<data dir>/documents/<random id>.pdf`; the uploaded name is
   kept only as sanitized display text. Paths are never returned.
3. The response is `202` with `status: "pending"`. A background task sends the PDF to the
   game master; poll `GET /api/documents/{id}` until `ready` or `failed` (with `error`).
4. `POST /api/question-sets` with ready documents you own, a `mode`
   (`practice` or `adventure`), `topic`, `count` (1–50), and an optional difficulty range.
   Also `202`; poll `GET /api/question-sets/{id}`.
5. The server validates the output (section 4) and stores every question with its private
   answer key. From then on a question is never regenerated: a pending attempt always
   shows the stored question, even after a restart.

**Jobs and restarts.** Ingestion and generation run as in-process background tasks, one
provider call each, bounded by `GAME_MASTER_TIMEOUT_SECONDS`. If the server stops
mid-job, startup marks every `pending`/`processing` document and question set as
`failed` ("Interrupted by a server restart"), so nothing stays "running" forever. There is
no automatic retry; upload or request again.

## 6. API reference

Interactive docs and schemas: `/docs` and `/openapi.json`. All `/api/` responses carry
`Cache-Control: no-store`. Errors always look like:

```json
{ "error": { "code": "insufficient_xp", "message": "A battle costs 30 XP. ...", "details": null } }
```

| Method and path | Auth | Purpose |
|---|---|---|
| `GET /healthz` | no | Service liveness and provider name (not player health) |
| `POST /api/auth/register` | no | `{username, password}` → 201 |
| `POST /api/auth/login` | no | → `{access_token, token_type, expires_at}` |
| `POST /api/auth/logout` | yes | Ends the current session (204) |
| `POST /api/study-packs` | yes | **Upload a PDF and get practice + adventure questions in one call** (multipart `file`, optional `topic`, `practice_count`) → 202 |
| `GET /api/study-packs/{document_id}` | yes | Pack progress: `status`, `stage`, `error`, and both question sets |
| `GET /api/study-packs` | yes | Your packs, newest first |
| `POST /api/documents` | yes | Upload a PDF only (multipart `file`) → 202 |
| `GET /api/documents/{id}` | yes | Owner's ingestion status |
| `POST /api/question-sets` | yes | Request generation → 202 |
| `GET /api/question-sets/{id}` | yes | Status and safe question summaries (never answers) |
| `GET /api/me/state` | yes | Full authoritative state, villains, rules, `state_version` |
| `GET /api/me/status` | yes | Compact HUD object |
| `GET /api/me/export` | yes | gzip JSON progress snapshot |
| `GET /api/me/active-attempt` | yes | Pending question, if any; creates nothing |
| `POST /api/practice/attempts` | yes | Select and persist the next practice question (201), or return the pending one (200) |
| `POST /api/adventure/battles` | yes + `Idempotency-Key` | Start the next battle, charge entry once, return the first question |
| `POST /api/attempts/{id}/answer` | yes + `Idempotency-Key` | Submit `{"answer": "..."}`; returns feedback and updated XP/health |

There is no endpoint that sets XP or health, imports a snapshot, or accepts a user ID.

Status codes: 200/201/202/204 success · 401 not signed in · 403 registration closed · 404
unknown **or someone else's** resource · 409 not allowed now (`adventure_locked`,
`insufficient_xp`, `insufficient_health`, `battle_in_progress`, `no_practice_questions`,
`not_enough_questions`, `document_not_ready`, `attempt_already_answered`,
`idempotency_key_reused`, `state_conflict`) · 413 too large · 422 invalid request or
unusable answer (`invalid_request`, `invalid_answer`, PDF codes) · 500 `internal_error`
(details are logged by type only, never returned) · 503 `game_master_unavailable`.

### Public question (before answering)

```json
{
  "attempt_id": "…", "question_id": "…", "mode": "practice", "type": "numeric",
  "prompt": "How many chromosomes does a human cell contain?",
  "options": null, "difficulty": 3, "topic": "Mitochondria", "learning_objective": null,
  "sources": [{ "document_id": "…", "document_name": "notes.pdf", "pages": [4, 5] }],
  "battle": null
}
```

No answer, rubric, explanation, internal prompt, or retrieved text is included.

### Answer result

```json
{
  "attempt_id": "…", "correct": true,
  "feedback": { "correct_answer": "46", "explanation": "Humans have 23 pairs." },
  "xp_delta": 20, "xp": 120, "health_delta": 5, "health": 100, "max_health": 100,
  "encounter": { "mode": "practice", "outcome": "none", "adventure_unlocked_now": true,
                 "adventure_completed": false },
  "next_attempt": null, "state_version": 14
}
```

`xp_delta` and `health_delta` are the changes actually applied, after clamping at 0 or at
the maximum. In a battle, `encounter.outcome` is `in_progress`, `won`, `lost`, or
`knocked_out`, and `next_attempt` holds the next question while the battle continues.
`feedback` appears only after the answer is accepted.

### Compact status

```json
{ "schema_version": 1, "state_version": 14, "xp": 120, "health": 100, "max_health": 100,
  "adventure_unlocked": true, "adventure_completed": false, "location": "practice" }
```

`location` is `playground`, `lesson`, `practice`, `adventure`, or `battle`.

## 7. Authentication and sessions

No authentication existed in the repository, so a minimal one is built in:

- Passwords: Argon2 (`argon2-cffi`), 8–256 characters; usernames 3–32 of letters, digits,
  `.`, `_`, `-`, unique case-insensitively. A failed login looks the same whether or not
  the username exists.
- Login returns a random 256-bit opaque token (`secrets.token_urlsafe`). Only its SHA-256
  is stored. Send it as `Authorization: Bearer <token>`. Logout deletes the session;
  sessions expire after `LEARNING_GAME_SESSION_TTL_HOURS`.
- Because tokens travel in a header (not a cookie), CSRF does not apply. This means a
  stolen token is a stolen session: **use HTTPS** and avoid putting tokens in URLs or logs.
- A player may have several sessions at once; all see the same account state.
- Player identity comes only from the token. There is no development bypass.
- Not implemented: rate limiting, lockout, password reset, email verification, MFA.

## 8. XP and health rules

See the table in [README.md](README.md#game-rules); the values live in the engine's `rules.py`.
Enforced where: reward lookup, clamping, health, and early defeat are in the engine's `engine.py`
(`submit_practice_result`, `submit_battle_result`); the stored question's difficulty is
what the engine uses; the client never supplies correctness, difficulty, or balances.

Question selection (`application/game_service.py`): practice uses your ready practice questions, least
often attempted first, in generation order. Each battle takes one adventure question at the
villain's exact target difficulty: Forest Goblin 1, Bridge Troll 3, Castle Dragon 5. Within
that difficulty it chooses the least-used question first, then generation order. If the
stored pool lacks the exact difficulty, battle start returns `409 not_enough_questions`
without charging the player. This is a simple starting policy, not adaptive teaching.

## 9. Concurrency and idempotency

- Every state-changing request runs in one SQLite `BEGIN IMMEDIATE` transaction that
  checks for an earlier result, validates the attempt, applies the engine action,
  records the attempt and result, and bumps `state_version`. Any failure rolls back
  everything. `player_states` is also updated with `WHERE state_version = ?`; a mismatch
  returns `409 state_conflict`.
- `attempts.id` is the primary key and `submissions` has `UNIQUE (owner_id,
  idempotency_key)`, so a double submit cannot double-award even if the checks were bypassed.
- **Retry**: send the same `Idempotency-Key` (8–128 chars, `A-Za-z0-9_.:-`) and the same
  answer → the stored result is returned unchanged, XP and health are not touched again.
- **Conflict**: a different key for an already answered attempt → `409
  attempt_already_answered`. The same key with a different answer → `409
  idempotency_key_reused`.
- **Invalid input** (blank, not a number, not an option) → `422`; the attempt stays open.
- Starting a battle uses the same mechanism, so a retried request is not charged twice.
  Use a **new** key for each intended battle.
- Creating a practice attempt returns the pending one if it exists (`created: false`).

Tests: eight threads submitting one attempt produce exactly one success; six threads
retrying with one key all receive the same stored result.

## 10. Building a frontend

- Call `GET /api/me/status` for the HUD and `GET /api/me/state` after login. On page load
  or reconnect, call `GET /api/me/active-attempt` and resume that question; do not call
  `POST /api/practice/attempts` just to look.
- Generate one `Idempotency-Key` per user action and reuse it only when retrying after a
  network error or timeout.
- Treat server responses as the truth; never compute XP or health in the client, and show
  `xp_delta`/`health_delta` from the answer response.
- Keep the token in memory (or a storage choice you have threat-modelled). Never log it.
- Set `LEARNING_GAME_CORS_ORIGINS` to your exact frontend origin(s); credentials/cookies
  are not used (`allow_credentials` is off).
- Render prompts and explanations as plain text, not HTML.
- Show `sources` as attribution only when `pages` is non-empty if you want to display
  page numbers.
- `GET /api/me/export` returns `progress.json.gz`: a download for the player, with no
  credentials, answer keys, or document text. There is no import endpoint, so a client
  copy can never overwrite server state.

## 11. Persistence, authentication, transactions, compression

Four separate jobs:

| Concern | Mechanism |
|---|---|
| **Persistence** (progress survives refresh, logout, restart) | SQLite `player_states` with typed `xp`, `health`, `max_health`, `adventure_unlocked`, `state_version`; the rest in `state_json` |
| **Authorization** (only the owner can read or change it) | bearer token → account; every query is scoped to that account; foreign IDs return 404 |
| **Consistency** (no double awards, no half updates) | `BEGIN IMMEDIATE` transactions, unique constraints, idempotency keys, version check |
| **Compression** (smaller payloads) | standard HTTP gzip via `Accept-Encoding: gzip` |

XP and health are stored as normal integers; nothing numeric is compressed. Responses
under `LEARNING_GAME_GZIP_MINIMUM_BYTES` (default 1000) are sent uncompressed because
gzip can make tiny bodies larger. Measured at default settings: `/api/me/status` is about
155 bytes and `/api/me/state` about 635 bytes, so both are sent uncompressed. Responses
that pass the threshold, such as a question set with dozens of questions, are compressed
when the client sends `Accept-Encoding: gzip`. Lower the threshold if you prefer. Field
names are left readable; no custom binary format is used. (The test suite lowers the
threshold to prove the middleware works.)

## 12. Database and migrations

SQLite file `learning_game.sqlite3` in the data directory (WAL mode, foreign keys on).
The schema version is stored in `PRAGMA user_version`; numbered migrations are in
`db.MIGRATIONS`. The server applies pending ones at startup, and
`uv run learning-game-api migrate` does so explicitly (safe to repeat). A database newer
than the code is refused. To change the schema, append a new entry to `MIGRATIONS`; never
edit an existing one. Back up the database file (and `documents/`) while the server is
stopped, or use SQLite's online backup.

## 13. Dummy mode versus real RAG mode

| | `fake` | `http` (real) |
|---|---|---|
| Questions | Multiplication facts generated from a formula | Whatever the game master returns |
| Uses the PDF text | **No** | Expected |
| Pages / sources | None (empty `pages`) | As supplied |
| Labelled in API | `provider: "fake"`, generation model "fake-provider (not grounded in the PDF)" | Provider name `http` |
| When active | Only if you set `GAME_MASTER_MODE=fake`; logs a warning at startup | Only if you set `http` |

If the real provider fails, the job fails visibly. Nothing falls back to fake or
packaged questions.

## 14. Deployment notes

- Run behind an HTTPS-terminating reverse proxy; do not expose plain HTTP to users.
  Listen on `127.0.0.1` (the default) and let the proxy forward.
- Run **one** server process (SQLite on one host with in-process jobs). Starting a
  second process on the same data would mark the first one's running jobs as failed,
  because startup recovery assumes no other process is working.
- Put the data directory on durable storage, restrict its permissions, and back it up.
- Add rate limiting at the proxy for `/api/auth/*`.
- The server is not a distributed or high-availability design.

## 15. Local saves from other tools

The backend never reads or imports save files from any other tool (such as a local terminal
version of the game). Account progress exists only in the backend database. There is
intentionally no import endpoint, because it would let anyone claim progress by uploading a
file; an authenticated, one-time, audited import would have to be designed first.

## 16. End-to-end example

With the server running (`GAME_MASTER_MODE=fake uv run learning-game-api serve`), this is
the sequence a frontend performs. The same flow, over real HTTP with a restart in the
middle, was run successfully against the fake provider:

1. Register and log in → token.
2. `POST /api/study-packs` with the PDF → `document_id`; poll `GET /api/study-packs/{id}` until
   `ready`. (The older way: upload with `/api/documents`, then request both sets with
   `/api/question-sets`; the adventure output must cover exact difficulties 1, 3, and 5.)
3. Play practice questions as below.
4. Until the adventure unlocks: `POST /api/practice/attempts`, answer. Each correct answer
   earns 10-30 XP by its difficulty; the response that reaches 100 XP has
   `adventure_unlocked_now: true`.
5. `POST /api/adventure/battles` with a new `Idempotency-Key` → the entry cost (30 XP) is taken
   once; repeating the same request returns the identical body and charges nothing more.
6. Answer the battle question (one per villain, at difficulty 1, 3, then 5). A wrong answer
   costs XP and health by difficulty; a right one earns XP.
7. `GET /api/me/status` → current `xp`, `health`, and `location` (for example `"battle"`).
8. Stop and restart the backend; log in again.
9. `GET /api/me/state` is identical, `GET /api/me/active-attempt` returns the same
   pending question, and answering it continues the battle.

This flow has been run end to end with the real backend and the `ai_module` game master service
(Gemini replaced by a stand-in): the study pack, practice, unlock, and all three villains. With
real Gemini, step 2 should show `provider: "http"` on the pack's sets; **that has not been run**.

## 17. Remaining limitations

See the list in [README.md](README.md#operational-limits). In addition: only `numeric` and
`multiple_choice` question types are accepted; long-running jobs share the server
process; a provider call blocks one worker thread for up to its timeout; the player's
documents and question sets are not deletable through the API; and per-user quotas are not enforced.

## 18. Running all checks

From `backend/`:

```sh
uv sync --locked
uv run python -m unittest discover -s tests -v
uv run ruff check .
uv run ruff format --check .
uv run mypy src
```

The engine has its own checks (see `../Game_Engine/README.md`).

Tests use temporary databases and the fake or scripted providers only; they need no
credentials, network, or paid services. They are organized as:

| Folder | Contents |
|---|---|
| `tests/unit/` | Settings, migrations, accounts, PDF checks, RAG output validation, the evaluator |
| `tests/contract/` | The HTTP contract with the game master (mock transport) and the OpenAPI document |
| `tests/integration/` | The HTTP API end to end, and the full register-to-victory journey with a restart |

To write a new API test, subclass `ApiTestCase` in `tests/api_helpers.py`, register a user
with `self.register()`, and drive the endpoints with `self.client`. After an intentional API
change, regenerate the committed spec: `uv run learning-game-api openapi contracts/openapi.json`.

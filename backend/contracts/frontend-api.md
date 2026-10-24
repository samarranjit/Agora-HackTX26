# Frontend ↔ Backend API Guide

How the React/Three.js frontend uses the backend. The authoritative, machine-readable
description is [`openapi.json`](openapi.json), generated from the backend code (a backend test
fails if it is stale). Generate a typed client from it, or at least check that every
endpoint your client calls exists in it. This guide explains the flows and who owns each value.

## Rules for the frontend

1. Call **only** the backend. Never call the RAG/game-master service.
2. Never calculate XP, health, costs, rewards, unlocks, or battle outcomes. Display the values
   the backend returns (`xp`, `health`, `xp_delta`, `health_delta`, `encounter`, `state_version`).
3. Render every backend string (prompts, options, explanations, document names) as plain
   text. Never inject it as HTML.
4. Never expect an answer key before submitting. Questions arrive without answers; the
   correct answer and explanation arrive only in the answer response.
5. Send one `Idempotency-Key` per intended battle start or answer, and reuse it only to retry
   that same action.

## Configuration

Make the backend URL configurable, for example in a Vite app:

```
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Everything in a `VITE_` variable is public in the built bundle, so never put secrets there. The backend's
`LEARNING_GAME_CORS_ORIGINS` must list the exact origin the frontend is served from
(for example `http://localhost:5173` in development).

## Startup order

1. Backend: `cd backend && GAME_MASTER_MODE=fake uv run learning-game-api serve`
   (the demo provider; a real game master needs `GAME_MASTER_MODE=http`).
2. Frontend: your dev server, with the backend URL configured as above.

## Authentication

```http
POST /api/auth/register   {"username": "ada", "password": "correct horse battery"}   → 201
POST /api/auth/login      {"username": "ada", "password": "correct horse battery"}
→ 200 {"access_token": "…", "token_type": "bearer", "expires_at": "2026-10-31T12:00:00+00:00"}
```

Send `Authorization: Bearer <access_token>` on every other `/api/` call. A `401` means the
session is missing, invalid, or expired: discard the token and sign in again. Keep the token
in memory or `sessionStorage` (it survives reloads within a tab); anything stored in the page
is readable by its scripts, so render backend text as plain text and avoid untrusted scripts.
The backend never accepts a user ID from the client; identity comes only from the token.

## Page load and reconnect

On load (and when the browser fires `online`), if a token exists:

1. `GET /api/me/status` for the HUD (or `GET /api/me/state` for the full state).
2. `GET /api/me/active-attempt` and, if `attempt` is not null, show that exact question.
   This call creates and changes nothing. Do not call `POST /api/practice/attempts` just to
   look: that is a mutation (it selects and stores the next question).

A resumed question is the same stored question as before, with the same `attempt_id`,
even after a backend restart.

## Playing

```text
POST /api/practice/attempts            → 201 new question, or 200 the question already pending
POST /api/adventure/battles            Idempotency-Key: <key>   → first battle question
POST /api/attempts/{attempt_id}/answer Idempotency-Key: <key>   {"answer": "12"}
```

The answer response:

```json
{
  "attempt_id": "…", "correct": true,
  "feedback": { "correct_answer": "12", "explanation": "…" },
  "xp_delta": 20, "xp": 120, "health_delta": 5, "health": 100, "max_health": 100,
  "encounter": { "mode": "practice", "outcome": "none", "adventure_unlocked_now": true,
                 "adventure_completed": false },
  "next_attempt": null, "state_version": 14
}
```

`xp_delta` / `health_delta` are the changes actually applied (after clamping). In a battle,
`encounter.outcome` is `in_progress`, `won`, `lost`, or `knocked_out`, and `next_attempt`
holds the next question while the battle continues.

## Retries and idempotency

| Situation | What to do |
|---|---|
| Network error or timeout on an answer or battle start | Retry with the **same** `Idempotency-Key` and the same answer. The backend returns the stored result and changes nothing twice |
| User clicks again after a failure | Same as above while the earlier action is unresolved |
| User submits a different answer for the same question | Generate a new key. If the question was already answered the backend replies `409 attempt_already_answered` |
| `422 invalid_answer` (blank, not a number, not an option) | The attempt is still open; ask for a new answer (a new key is fine) |
| `409 idempotency_key_reused` | The key was already used with a different answer: generate a new one |
| `5xx` | Show the message; retrying with the same key is safe |
| New battle after finishing one | Use a **new** key |

Other `409` codes explain why an action is not allowed right now and carry a readable
`message`: `adventure_locked`, `insufficient_xp`, `insufficient_health`, `battle_in_progress`,
`no_practice_questions`, `not_enough_questions`, `document_not_ready`,
`adventure_completed`, `state_conflict`.

## Errors

Every error has one shape:

```json
{ "error": { "code": "insufficient_xp", "message": "A battle costs 30 XP. Earn 12 more XP in practice.", "details": null } }
```

`code` is stable for programs; `message` is for people. `422 invalid_request` includes
`details: [{field, problem}]`.

## Documents and question sets (optional features)

```text
POST /api/documents (multipart "file")  → 202 {document_id, status: "pending"} … poll until "ready" or "failed"
POST /api/question-sets {document_ids, mode, topic, count} → 202 … poll until "ready" or "failed"
```

Statuses are `pending`, `processing`, `ready`, `failed` (with `error`). Poll every second or
two with a timeout; do not wait forever. Another player's IDs always look like `404`.

## Who owns each value

| Value | Owner | Notes |
|---|---|---|
| `xp`, `xp_delta`, `health`, `health_delta`, `max_health` | Game Engine (via the backend) | Applied rules; clamped; never computed by the frontend or RAG |
| `adventure_unlocked`, `adventure_unlocked_now`, `adventure_completed` | Game Engine | Permanent unlock at the engine's threshold |
| `encounter.outcome`, `question_number`, `correct_count`, villain `status` | Game Engine | |
| `location` | Game Engine | `playground`, `lesson`, `practice`, `adventure`, `battle` |
| `state_version` | Backend | Increments on every committed change |
| `attempt_id`, `question_id`, `battle_attempt_id`, `document_id`, `question_set_id` | Backend | Generated by the server |
| `correct` | Backend (evaluator) | Decided with the stored private key |
| `prompt`, `options`, `topic`, `learning_objective` | RAG, validated and stored by backend | |
| `difficulty` | RAG proposes; backend validates 1–5 and stores | The engine uses the stored value |
| `feedback.explanation`, `feedback.correct_answer` | RAG content / stored key | Returned only after the answer is accepted |
| `sources[].document_name`, `pages` | Backend (name), RAG (pages) | Pages are shown only if the RAG supplied them |
| `idempotency key` | Frontend | One per intended action |
| `rules` block in `/api/me/state` | Game Engine | For display only (for example "battles cost 30 XP") |

## Known gaps

- No lesson/slide or villain-story endpoints yet; lesson content and villain artwork live in
  the frontend for now. Villain IDs and names come from `/api/me/state`.
- No endpoint deletes documents or question sets.

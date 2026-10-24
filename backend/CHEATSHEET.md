# Backend Cheatsheet: for the Frontend and RAG teams

One page to integrate with the learning-game backend. Full details:
[contracts/frontend-api.md](contracts/frontend-api.md), [contracts/rag-contract.md](contracts/rag-contract.md),
[contracts/openapi.json](contracts/openapi.json) (machine-readable; also live at `/docs`).

```text
Frontend ──HTTPS + Bearer token──▶ Backend ──HTTP, contract v1──▶ RAG / game master
                                     └── Game_Engine (all XP / health / battle rules)
```

| Rule | Why |
|---|---|
| The frontend calls **only** the backend, never the RAG service | The backend validates content and owns the answer keys |
| The frontend never computes XP, health, costs, unlocks, or outcomes | The engine is the single source of truth; show what the backend returns |
| The RAG service never sees players and never decides rewards | Unknown fields like `"xp_reward"` are ignored |
| Every backend string is plain text (never `innerHTML`) | Prompts come from PDFs and models |

## Run the backend locally

```sh
cd backend
uv sync --locked
GAME_MASTER_MODE=fake LEARNING_GAME_CORS_ORIGINS=http://localhost:5173 \
  uv run learning-game-api serve        # http://127.0.0.1:8000, docs at /docs
```

`GAME_MASTER_MODE`: `fake` = demo questions (**not** from the PDF; for frontend work),
`http` = real RAG at `GAME_MASTER_URL` (+ `GAME_MASTER_API_KEY`), `disabled` (default) =
uploads return 503. CORS origins must be exact (`*` is rejected).

---

## Part 1: Frontend

### Endpoints

All `/api/` calls except register/login need `Authorization: Bearer <access_token>`.

| Method + path | Body | Returns | Notes |
|---|---|---|---|
| `POST /api/auth/register` | `{username, password}` | 201 `{user_id, username}` | username 3–32 `[A-Za-z0-9_.-]`, password 8–256 |
| `POST /api/auth/login` | `{username, password}` | `{access_token, token_type, expires_at}` | |
| `POST /api/auth/logout` | – | 204 | |
| `GET /api/me/status` | – | `StatusResponse` | small HUD object |
| `GET /api/me/state` | – | `PlayerStateResponse` | full state, villains, rules |
| `GET /api/me/active-attempt` | – | `{attempt: PublicQuestion \| null}` | **read-only**: use on load/reconnect |
| `POST /api/practice/attempts` | `{}` or `{question_set_id}` | `{created, attempt}` | 201 new, 200 = already pending one |
| `POST /api/adventure/battles` | `{}` or `{question_set_id}` | `BattleStartResponse` | **needs `Idempotency-Key`**; charges 30 XP once |
| `POST /api/attempts/{attempt_id}/answer` | `{answer: "12"}` | `AnswerResponse` | **needs `Idempotency-Key`**; graded server-side |
| `POST /api/documents` | multipart `file` (PDF) | 202 `DocumentResponse` | poll `GET /api/documents/{id}` |
| `POST /api/question-sets` | `{document_ids, mode, topic, count, difficulty_min?, difficulty_max?}` | 202 `QuestionSetResponse` | poll `GET /api/question-sets/{id}` |
| `GET /healthz` | – | `{status, game_master}` | no auth; service liveness, not player health |

`mode` is `"practice"` or `"adventure"`; `count` 1–50; difficulty 1–5. Request bodies reject
unknown fields (`422`), so you cannot send `correct`, `xp`, `difficulty`, etc.

### Data shapes (from `openapi.json`)

```ts
interface StatusResponse { schema_version: number; state_version: number; xp: number; health: number;
  max_health: number; adventure_unlocked: boolean; adventure_completed: boolean;
  location: "playground" | "lesson" | "practice" | "adventure" | "battle" }

interface PublicQuestion {          // what you show BEFORE an answer: no answer, no explanation
  attempt_id: string; question_id: string; mode: "practice" | "adventure";
  type: "numeric" | "multiple_choice"; prompt: string;
  options: { id: string; text: string }[] | null;      // multiple choice: answer with the option id
  difficulty: number;                                   // 1-5
  topic: string; learning_objective: string | null;
  sources: { document_id: string; document_name: string | null; pages: number[] }[];  // pages may be []
  battle: { battle_attempt_id: string; villain_id: string; villain_name: string;
            question_number: number; question_count: number; correct_count: number } | null }

interface AnswerResponse {
  attempt_id: string; correct: boolean;
  feedback: { correct_answer: string; explanation: string };   // only after answering
  xp_delta: number; xp: number; health_delta: number; health: number; max_health: number;
  encounter: { mode: "practice" | "adventure";
               outcome: "none" | "in_progress" | "won" | "lost" | "knocked_out";
               villain_id?: string | null; question_number?: number | null;
               question_count?: number | null; correct_count?: number | null;
               adventure_unlocked_now: boolean; adventure_completed: boolean };
  next_attempt: PublicQuestion | null;    // next battle question while the battle continues
  state_version: number }

interface BattleStartResponse { battle_attempt_id: string; villain_id: string; villain_name: string;
  entry_cost: number; xp: number; health: number; state_version: number; attempt: PublicQuestion }

interface PlayerStateResponse { username: string; state_version: number; updated_at: string;
  xp: number; health: number; max_health: number; adventure_unlocked: boolean;
  adventure_completed: boolean; location: string; practice_answered: number;
  villains: { villain_id: string; name: string; status: "completed" | "current" | "locked" }[];
  active_battle: { battle_attempt_id: string; villain_id: string; question_number: number;
                   question_count: number; correct_count: number } | null;
  pending_attempt_id: string | null;
  rules: { unlock_threshold: number; battle_cost: number; battle_question_count: number;
           battle_wins_required: number; correct_xp_by_difficulty: number[] } }   // display only

interface ErrorResponse { error: { code: string; message: string;
  details: { field: string; problem: string }[] | null } }
```

### Flows

1. **Login** → store `access_token` (memory or `sessionStorage`) → `GET /api/me/state`.
2. **Page load / reconnect** → `GET /api/me/status` + `GET /api/me/active-attempt`. If an
   attempt comes back, show that exact question (same `attempt_id`, even after a server
   restart). Do not call `POST /api/practice/attempts` just to look.
3. **Practice** → `POST /api/practice/attempts` → show `attempt.prompt` → answer.
4. **Battle** → `POST /api/adventure/battles` (+ key) → answer `attempt` → keep answering
   `next_attempt` until `encounter.outcome` is `won`, `lost`, or `knocked_out`.
5. **After every answer** → render `feedback`, `xp_delta`, `health_delta`; refresh the HUD from
   the response (or `GET /api/me/status`). Never add numbers yourself.

### Idempotency-Key (battle start and answer)

```js
const key = crypto.randomUUID();                 // ONE per user action (8-128 chars, A-Za-z0-9_.:-)
async function submit(attemptId, answer) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${API}/api/attempts/${attemptId}/answer`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json",
                   "Idempotency-Key": key },                    // SAME key on every retry
        body: JSON.stringify({ answer }) });
      return { status: r.status, body: await r.json() };
    } catch { /* network error: retry with the same key */ }
  }
  throw new Error("offline");
}
```

| Response | Meaning / what to do |
|---|---|
| same key + same answer resent | Backend returns the stored result; nothing is applied twice |
| `409 attempt_already_answered` | That question was answered by another request; fetch `/api/me/active-attempt` |
| `409 idempotency_key_reused` | You reused a key with a different answer; use a new key |
| `422 invalid_answer` | Blank / not a number / not an option; the question is still open |
| A retried battle start | Returns the original start (first question). Use `/api/me/active-attempt` for the current question |

### Error codes you will see

`401 not_authenticated | invalid_token` → sign in again. `404 *_not_found` (also for other
players' IDs). `409`: `adventure_locked`, `insufficient_xp`, `insufficient_health`,
`battle_in_progress`, `adventure_completed`, `no_practice_questions`, `not_enough_questions`,
`document_not_ready`, `attempt_already_answered`, `idempotency_key_reused`, `attempt_not_active`,
`state_conflict`. `411 length_required`, `413 too_large`, `422 invalid_request | invalid_answer |
not_a_pdf | malformed_pdf | encrypted_pdf | empty_pdf | empty_file`, `500 internal_error`,
`503 game_master_unavailable`. Show `error.message` to people; branch on `error.code` in code.

### Game rules (for display text only; the backend enforces them)

Correct answer: +10/15/20/25/30 XP for difficulty 1–5 (practice and battles). Correct practice
also restores 5 health. Adventure unlocks permanently at 100 XP. A battle costs 30 XP, has 3
questions, and needs 2 correct to win. A wrong battle answer costs 2×difficulty XP and
5×difficulty health; at 0 health the battle ends as `knocked_out` (no refund). Villains in
order: `forest-goblin` → `bridge-troll` → `castle-dragon`.

---

## Part 2: RAG / game master

The backend **calls you**. Implement two endpoints under your base URL. If an API key is
configured, the backend sends `Authorization: Bearer <GAME_MASTER_API_KEY>`. Timeout default is
60 s, and the backend does not retry automatically.

### `POST /v1/documents` (multipart: `file`, `document_id`)

Ingest the PDF; respond when it is searchable.

```json
{ "status": "ready" }
{ "status": "failed", "error": "The PDF contains only scanned images." }
```

### `POST /v1/question-sets` (JSON)

```json
{ "contract_version": 1, "question_set_id": "0f3c…32hex", "document_ids": ["a1b2…32hex"],
  "topic": "Mitochondria", "mode": "practice", "count": 5, "difficulty_min": 1, "difficulty_max": 5 }
```

Retrieve **only** from `document_ids`. Return at most `count` questions:

```json
{
  "schema_version": 1,
  "generation": { "model": "…", "prompt_version": "…", "pipeline_version": "…", "generated_at": "…" },
  "questions": [
    { "id": "q-001", "type": "numeric", "prompt": "How many chromosomes does a human cell contain?",
      "answer": { "value": 46 }, "grading": { "tolerance": 0 },
      "explanation": "Humans have 23 pairs of chromosomes.", "difficulty": 3,
      "topic": "Mitochondria", "learning_objective": "Count chromosomes",
      "sources": [{ "document_id": "a1b2…32hex", "pages": [4, 5] }] },
    { "id": "q-002", "type": "multiple_choice", "prompt": "Which organelle makes most ATP?",
      "options": [{ "id": "A", "text": "Nucleus" }, { "id": "B", "text": "Mitochondrion" }],
      "answer": { "option_id": "B" }, "explanation": "Mitochondria produce ATP.", "difficulty": 2 }
  ]
}
```

### Validation checklist (one bad question rejects the whole set)

- [ ] `schema_version` is `1`; `questions` is non-empty and has at most `count` items
- [ ] every `id` is unique within the set (≤ 200 chars) and stable for the same question
- [ ] `type` is `numeric` or `multiple_choice` (nothing else yet)
- [ ] `difficulty` is an **integer** 1–5 (not `"3"`, not `2.5`, not `true`)
- [ ] `prompt` and `explanation` are non-empty, ≤ 4000 chars, plain text
- [ ] numeric: `answer.value` is a finite number (or numeric string); optional `grading.tolerance` ≥ 0
- [ ] multiple choice: 2–6 `options`, unique ids of 1–32 `[A-Za-z0-9_-]`, `answer.option_id` is one of them
- [ ] `mode`, if present, equals the requested mode
- [ ] `sources[].document_id` is one of the requested `document_ids`; `pages` are positive integers
- [ ] **never invent page numbers**: omit `pages` if you do not know them
- [ ] do not send rewards, XP, or progression fields; they are ignored

Only these `generation` keys are kept: `provider_question_set_id`, `model`, `prompt_version`,
`pipeline_version`, `generated_at`.

### Errors

Return HTTP ≥ 400 with `{"error": "short, user-safe message"}`. The first 200 characters are
shown to the player. Raw bodies, URLs, and keys are never forwarded. Timeouts and invalid JSON
fail the job with a generic message. The backend **never** falls back to fake questions.

### Test your service against the backend

```sh
GAME_MASTER_MODE=http GAME_MASTER_URL=http://127.0.0.1:9000 GAME_MASTER_API_KEY=dev \
  uv run learning-game-api serve
```

Then register → upload a PDF → `POST /api/question-sets` → poll it: `status: "failed"` comes
with an `error` naming the first validation problem.

---

## Who owns what

| Value | Owner |
|---|---|
| XP, health, deltas, unlock, battle outcome, villain status, `location` | Game Engine (via backend) |
| `correct` | Backend, grading with the stored private answer key |
| `state_version`, all IDs (`attempt_id`, `question_id`, `document_id`, …) | Backend |
| `prompt`, `options`, `explanation`, `difficulty`, `sources.pages`, answer key | RAG (validated and stored by the backend) |
| `Idempotency-Key` | Frontend (one per user action) |

Current limits: one backend instance (SQLite, in-process jobs); no rate limiting or password
reset; no delete endpoints; no lesson/slide endpoints yet.

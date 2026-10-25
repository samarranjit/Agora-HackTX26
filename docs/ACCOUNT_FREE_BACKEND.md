> Historical account-free experiment. The latest mandatory Sign In → PDF → Play requirement supersedes this record. See [LINEAR_FLOW_VALIDATION.md](LINEAR_FLOW_VALIDATION.md) and [BACKEND_MODE.md](BACKEND_MODE.md) for current behavior.

# Required account-free backend contract

## Verified blocker, 2026-10-25

Freshly fetched `origin/main` is `62800b4160bf5b5ea48e6d0c34ebd798e6496dbb`. Its `backend/contracts/frontend-api.md`, `contracts/openapi.json`, `api/dependencies.py`, and study-pack/gameplay routes all require `HTTPBearer` account authentication for upload, polling and gameplay. `current_account` resolves the bearer to a database account. There is no anonymous adventure session in that contract.

The live service at `https://starter-shimmy-bunny.ngrok-free.dev` was initially offline (`ERR_NGROK_3200`), then returned HTTP 200 `{ "status": "ok", "game_master": "http" }`. Its live `/openapi.json` was read after it came online and confirms the same route security: PDF documents, question sets, study packs, practice, battles, answers and state all require `HTTPBearer`. `GET /api/study-packs` without credentials returns HTTP 401 `not_authenticated`. The actual browser's automatic unauthenticated upload was also rejected. The only unprotected operations in this contract are health and account creation/login; the frontend never calls the latter.

**The real backend does not support the requested complete account-free flow.** HTTP game-master configuration is not evidence of successful PDF generation. No live generation, grading, battle or persistence success is claimed.

## What the backend owner must implement

These are required capabilities, not implemented endpoints or guessed route names:

1. **Create an anonymous, temporary adventure through PDF upload.** Accept multipart PDF with no account, login, username/password, hidden account or shared account. Validate PDF size/type/content on the server. Establish a fresh adventure identity for every new upload/visit. Its owner must be an adventure, not an account record.
2. **Return an adventure-scoped capability and expiry.** If access control needs a random secret, scope it only to this temporary adventure, documents and game operations. Keep it in page memory only. Specify its request header or other wire mechanism in OpenAPI; it must not be an account token or reusable identity. Never rely on public document IDs alone or a global shared guest state.
3. **Poll processing within that scope.** Publish stable document/adventure IDs, indexing/question-writing stage, pending/ready/failed status and safe errors. Return actual generated practice/adventure set IDs when ready. Define whether failed preparation can be retried safely, and define idempotency for a lost upload response to prevent duplicate jobs.
4. **Expose temporary gameplay admission and state.** Provide the public question/attempt, XP, health, pending battle, unlocks, completion, state version and allowed world interactions for this adventure. Exclude private answer keys. A ready study pack alone is not a game-state/admission receipt.
5. **Grade and resolve all game actions on the server.** Practice, the five story interactions, guardian battles, answer acceptance, rewards, health costs, bridge admission, dragon/rescue outcome and wrong-answer recovery must belong to the current adventure. Define how the five forest objects and Goblin/Wolf/dragon relate to generated questions and server encounters. The current account campaign (Goblin/Troll/Dragon, 100-XP unlock, 30-XP entry) does not by itself define the requested five-tale guest campaign. Do not silently change those rules in the frontend.
6. **Support safe in-visit retries.** Define attempt/run identity, stale event rejection and idempotency for answers and battle entry. The client may retain these values only while the page remains open. A reload must never recover or resume the old adventure.
7. **Expire and clean up abandoned adventures.** Use a server-side TTL and cleanup for state, uploads, generated questions and provider artifacts. Browser/page-close cleanup cannot be the only mechanism. Returning to the app starts a fresh PDF upload and new adventure; no cross-visit progress restoration or permanent identity exists.
8. **Publish and test the wire contract.** Update OpenAPI and the frontend guide, CORS allow-list/methods/headers for the actual frontend origins, the ngrok bypass header and any temporary capability/idempotency header. Preserve structured safe errors. Test isolation between adventures, unauthenticated PDF processing, grading, admission, retry deduplication, expiry and fresh starts without any account record.

No protected backend code or dependencies were changed for this task. Removing auth decorators or using a shared account is not a scoped guest implementation.

## Frontend binding that remains blocked

The frontend automatically validates and attempts `POST /api/study-packs` with `credentials: 'omit'` and no bearer header. It can poll the existing study-pack shape in the current page's memory if accepted. Authentication rejection produces an error and Retry, without a login prompt or another play mode.

`src/api/guestBackend.js:openAdventure` deliberately rejects with `guest_adventure_unsupported`. This is the exact unbound seam for a future verified anonymous contract. It does not call a fictional endpoint. A successful upload or `ready` pack cannot bypass this guard. After the owner provides the contract, the frontend still needs its temporary admission/game-action binding and server-state-to-world mapping implemented and tested. Merely making the existing PDF endpoint public will not complete the adventure.

The internal `openAdventure`/`interact`/`answer` adapter names used by tests are JavaScript interfaces, not advertised backend capabilities. Only test fixtures implement success today; no fixture or local grading is available to a player.

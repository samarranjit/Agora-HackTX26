# Account mode in the Storywood

The root `src/` application offers two explicit modes. The offline guest demo retains its placeholder multiple-choice questions, five stories at 20 prototype XP each, three hearts, full reset on the third mistake, starter Goblin/Wolf, and three-question dragon. It sends no gameplay or PDF requests. Selecting a PDF in the landing page keeps the file in memory. Account mode requires sign-in and uses only the backend's gameplay and study-pack contract.

## Contract provenance

Fetched `origin` and inspected `origin/main` at `d1a94f136f6a9dd87a9ad3b499e093c59fa8ce03` directly. No branch switch or merge was used. Read `backend/contracts/frontend-api.md`, `backend/contracts/openapi.json`, `backend/INTEGRATION_GUIDE.md`, `backend/CHEATSHEET.md`, schemas and routes, campaign configuration, engine rules, and `ai_module/SERVICE.md`. Earlier cached-branch integration notes are historical. Backend, engine, and AI source were not modified.

```powershell
git fetch origin
git show origin/main:backend/contracts/frontend-api.md
git show origin/main:backend/contracts/openapi.json
git show origin/main:backend/src/learning_game_backend/api/schemas.py
git show origin/main:backend/src/learning_game_backend/api/routes/study_packs.py
git show origin/main:backend/src/learning_game_backend/api/routes/gameplay.py
git show origin/main:Game_Engine/src/learning_game_engine/rules.py
```

## Configuration and play

Set root `.env.local` to the running backend's URL, for example `VITE_API_BASE_URL=http://127.0.0.1:8000`, and restart root Vite. `.env.example` uses port 8796; match whichever port your backend actually serves. An unset/blank URL disables account mode without sending requests. Only HTTP(S) URLs without credentials, query or fragment are accepted. `VITE_PDF_MAX_MB` defaults to 20. All Vite settings are public; no AI keys belong in the frontend. Configure backend CORS for the exact frontend origin. No dependency or proxy was added.

1. On the landing choose **Sign in / register · PDF learning & saved progress**. Register or sign in. Accounts persist on the backend; this tab stores only its bearer session, selected pack ID and unresolved action metadata. Reconnect restores status, full state, and the exact pending question using GETs. Reload never creates a new question or battle.
2. Choose **Prepare PDF questions** or **Study PDFs**. Select/drop a PDF; lightweight size, extension, MIME and header checks happen locally. Explicitly click **Upload PDF & prepare questions**. The client posts authenticated multipart `file`, optional `topic`, and `practice_count` (1–30) to `/api/study-packs`. The browser sets the multipart boundary.
3. Observe `indexing`, `writing_questions`, and `ready`/`failed`. Both set counts and server errors are shown. Waiting is bounded at ten minutes. **Stop waiting** cancels client waiting only; jobs may continue. The coordinator outlives the modal, so closing/reopening retains a known processing ID. After reload, **Refresh saved PDFs**, select the pack, and **Resume waiting** if needed. Packs are listed with `GET /api/study-packs`; they are polled at `/api/study-packs/{document_id}`.
4. Practice from menu or E at any story pedestal. A selected pack supplies its real `practice.question_set_id`; battles use its real `adventure.question_set_id`. Without a selection the backend may choose from all ready account sets. A selected unready pack never silently falls back to unrelated sets. If only practice preparation succeeded, its ready practice set remains usable while adventure stays blocked.
5. Answer the exact server question. Multiple choice submits its option ID; numeric questions use text entry. Feedback and correct answers appear only after submission. All grading, XP, health, deltas, unlocks and outcomes come from server responses. There is no account collectible completion/reward invented by the client.
6. Adventure unlock is permanently server-controlled at 100 XP under the current rules; the account bridge follows that flag and waits for its visual lowering to finish before allowing crossing. Each battle costs 30 XP. The server chooses Forest Goblin, Bridge Troll, then Castle Dragon at difficulties 1, 3, 5. Current default battles have one question apiece. The UI also supports `next_attempt` for continued battles. The forest wolf is a decorative guardian marker, never a claim that the backend has a Wolf opponent. Menu and world interactions both request the next server guardian.
7. Complete result review before starting a new encounter. Closing or pausing preserves questions and review in memory. Server completion controls account victory and the princess's completion dialogue. Falling only returns the camera to safe exploration ground: it never changes server health, XP or campaign progress. Account world position/checkpoints are not persisted by this API.

## Recovery and authority

Battle starts and answers persist their exact payload and idempotency key before sending. Rapid repeated inputs share one request. Ambiguous failures (network, timeout, 5xx, malformed successful response) block new gameplay mutations until **Retry saved action** reuses the original key and payload, including after reload. No automatic mutation retry occurs. Definitive 4xx errors show the server message; invalid answers permit correction with a fresh key. Conflicts reconcile pending state. A 401 clears the expired tab session and asks for sign-in; backend progress remains saved.

Study-pack creation has no idempotency contract. A lost upload response might still have created a pack. The UI explains this and offers the saved PDF list before a manual re-upload. Failed/restarted jobs show backend failure; no client-side fake questions or offline success replace rejected account work. Selecting **Switch to offline guest demo** is a deliberate mode change, with independent progress.

The HUD prioritizes account XP and numeric server health, never guest hearts/prototype totals. `src/game/backendWorld.js` projects server unlock/completion into the renderer. It does not grade, reward or mutate gameplay. Scene resources and input listeners retain the shared lifecycle. Modals pause movement/look, release lock and trap focus; intentional return requests pointer lock with drag fallback retained.

## API and product limits

- Real PDF-derived questions require the backend's HTTP game master / AI service. Backend `fake` mode ignores PDF text. Frontend transport success does not establish generation quality or real-provider configuration.
- No anonymous sessions, server forest collectibles, story checkpoint persistence, run reset, document deletion or frontend-selected villain/difficulty are provided. Account practice does not mark an offline story collected. A fresh guest run never resets an account.
- The current engine's fixed 100-XP unlock, numeric health and campaign differ from the earlier proposed Easy/Medium/Hard relic rules. The client preserves offline rules and sends no fabricated XP, difficulty or completion evidence.
- The API has no delete/TTL cleanup contract for submitted PDFs. Logout revokes access; it does not delete account data or uploads.
- Persistence is backend-owned. SessionStorage permits reload recovery in one tab; blocked storage uses memory and cannot retain retry keys across reload. A closed tab requires sign-in again. Finishing feedback is transient; the committed result and next pending attempt remain recoverable from the server.

See `BACKEND_VALIDATION.md` for actual checks and live-environment limitations.

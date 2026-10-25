# Courtyard and backend integration

Current routing: the default `/` route is now the explicitly offline forest guest prototype. Its rules/lifecycle are documented in `FOREST_GUEST_PROTOTYPE.md`. The account-based courtyard described below is preserved in development at `/?demo=courtyard`; the shared Backend API Tester is also available from the forest's development menu. There is no implemented backend guest contract, and forest prototype XP is never submitted as account progression.

## Active frontend and backend source

Run the frontend from the **repository root**: root `package.json` → root `index.html` → `src/main.jsx`. All new integration work is in root `src/`. `frontend/ui/` is the existing packaged snapshot and has not been duplicated or updated with these features. Running Vite from that directory starts the older snapshot.

This frontend branch has **no checked-out `backend/` or `Game_Engine/`**. The implementation was checked against the cached `origin/backend_and_engine` commit `566a60a`, including its routes, schemas, service, `CHEATSHEET.md`, `INTEGRATION_GUIDE.md`, and `contracts/openapi.json`. Backend reference files were extracted under ignored `.qa.local/` for inspection. Use a separate checkout containing both `backend/` and its sibling `Game_Engine/`; do not replace the frontend working tree to start the server. Check the running server's `/docs` if your teammate has changed its contract since that commit.

## Start locally (PowerShell)

In the backend checkout, with Python **3.12+** and `uv` installed:

```powershell
cd backend
uv sync --locked
$env:GAME_MASTER_MODE = 'fake'
$env:LEARNING_GAME_CORS_ORIGINS = 'http://127.0.0.1:5173'
uv run learning-game-api serve
```

The backend defaults to `http://127.0.0.1:8000`. Keep `Game_Engine/` beside `backend/`: `pyproject.toml` uses a local path dependency. SQLite and uploaded files persist under the backend data directory. Run one server process.

In this frontend's repository root:

```powershell
$env:VITE_API_BASE_URL = 'http://127.0.0.1:8000'
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open **http://127.0.0.1:5173**. Alternatively copy `.env.example` to `.env.local` in the root and restart Vite. The API URL defaults to `http://127.0.0.1:8000`. `VITE_` values are public: put no private keys or secrets in them.

CORS must match the browser's exact origin. If you open `http://localhost:5173`, configure that origin instead, or set `LEARNING_GAME_CORS_ORIGINS` to `http://127.0.0.1:5173,http://localhost:5173` and restart the backend. A different Vite port also requires its own exact origin. Wildcards are rejected. The server permits Authorization, Content-Type, and Idempotency-Key headers.

## Register, prepare questions, and practice

1. From the courtyard start menu, choose **Sign in / register**, then **Create a new account**. Usernames are 3–32 letters, digits, `_`, `.`, or `-`; passwords are 8–256 characters. Registration is followed by login. Existing players can sign in directly. Account → **Sign out** calls the backend logout endpoint.
2. Choose **Study material** / **Prepare questions**. Select a real, readable PDF and click **Upload PDF & wait**. It must reach `ready`; failures show the actual message. The ready document's real ID is added to the document-ID field.
3. Create a **practice** set (count 5 is useful for fake mode), then an **adventure** set (at least 3 questions). Wait for each to become ready. The default difficulty range is 1–5. Save job IDs if you want to check them after closing the panel; the backend currently has no list endpoint. Polling stops after two minutes or when the panel closes; jobs may continue on the server. Reopen and poll the ID to check them.
4. Choose **Practice questions**. Numeric questions take text answers; choices submit the option ID. The backend grades and supplies feedback, XP and health. Choose **Practice another question** to continue. In fake mode, a five-question set over difficulty 1–5 earns 100 XP when all five answers are correct.

**Fake mode is a development fixture. Its arithmetic questions ignore uploaded PDF text.** Real PDF-based questions require the teammate's RAG service, configured only on the backend with `GAME_MASTER_MODE=http`; the frontend never calls RAG directly.

## Challenge the Forest Goblin

Enter the courtyard, walk diagonally forward/right to the green, pointed-ear goblin beside the eastern garden path (world position x=5.5, z=14), and press **E** when the prompt appears. This opens the question overlay and starts `POST /api/adventure/battles` for a signed-in player with no pending question. A guest is prompted to sign in; after signing in, return to the courtyard and press E to deliberately start a battle. An existing pending question is resumed.

The backend permanently unlocks adventure at **100 XP**, charges **30 XP** per battle, checks health and ready adventure content, and chooses the next villain: Forest Goblin, Bridge Troll, then Castle Dragon. No villain ID, client XP, difficulty, or player ID is submitted. After the goblin is defeated the same courtyard interaction challenges the next server-selected guardian; the dialog names that guardian. Only the goblin has a world model in this slice.

Answer each question, review feedback, and choose **Continue to the next question** when the server returns `next_attempt`. Victory, loss, knockout, balances and deltas come from the answer response. **Finish review** dismisses the finished result so the next interaction can start a new encounter. Closing a dialog preserves the pending question. Menu → **Resume pending question** returns to it; reload and browser reconnection recover it with `GET /api/me/active-attempt`.

If entry is denied, the actual server message explains the reason. Use practice for XP/health, prepare missing content, or recover a pending question. Offline exploration, the decorative sword and moat respawn do not change server health or XP. The existing bridge remains raised; integrated battles do not implement the proposed offline relic/floor/rescue route. Offline difficulty values and 5-XP relic rules are unchanged and are never submitted as backend admission evidence.

## Developer API Tester

The **Backend API Tester** entry is in the start/pause menu only in Vite development builds. Its component and entry are excluded from production builds. It uses the exact client and session coordinator used by the game.

- **GET /healthz**, status, full state, and active-attempt controls are independent reads. Results include actual HTTP status, timing, sanitized requests and responses in the most recent 40-request history.
- Register/login/logout and practice/battle/answer controls call their real POST endpoints. Optional question-set IDs filter selection; leaving them blank lets the backend select ready content.
- Expand **PDF documents & question sets** for upload, preparation, and bounded polling. Job IDs and errors are real responses.
- Opening the panel starts no state-changing requests. Labels distinguish reads from mutations. Passwords, tokens and Authorization are redacted. History is in memory and resets on reload. Backend text is rendered as text.

## Retry and session behavior

The bearer token is stored in `sessionStorage` for this tab, along with an unresolved gameplay action's exact endpoint, payload and idempotency key. One battle-start or answer key is created per intended action and persisted **before** sending. Requests are serialized, including rapid clicks and E repeats. Network errors, timeouts, invalid success responses and 5xx errors retain the action. **Retry saved action** reuses its exact payload/key, including after reload. New gameplay mutations remain blocked until it is resolved. A rejected 4xx action permits a corrected/new action; conflicts trigger a read to recover current state. Practice creation uses the backend's existing-pending-attempt behavior.

Successful mutations reconcile status, full state and active attempt. A replayed battle start cannot replace a later pending question with its old first question. 401 responses clear the session and direct the player to sign in again. Offline failures keep the session so reconnect can restore it. If browser storage is unavailable the app continues in memory, with no reload recovery for its saved key. There is no automatic mutation retry or question creation on page load.

## Verification and limits

```powershell
npm.cmd run build
npm.cmd run lint
node --test tests/*.test.js
```

See `BACKEND_VALIDATION.md` for actual results and the distinction between real-network browser checks, intercepted frontend flow checks, and unavailable live-backend checks. No dependency was added. No commit, push, merge, reset or clean was performed.

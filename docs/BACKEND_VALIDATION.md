# Historical integration validation

The current account-free implementation is documented in [ACCOUNT_FREE_VALIDATION.md](ACCOUNT_FREE_VALIDATION.md). Account/offline behavior and results below are retired historical records, not current player capabilities.

# Integration validation

## Current root forest account mode — 2026-10-25

Contract fetched from `origin/main` at `d1a94f136f6a9dd87a9ad3b499e093c59fa8ce03`, inspected with `git show` without switching/merging branches. See [BACKEND_MODE.md](BACKEND_MODE.md) for setup, actual behavior and API limitations, and [BACKEND_MODE_PLAN.md](BACKEND_MODE_PLAN.md) for the short implementation plan. Prior cached-branch validation below is historical.

Implemented in root `src/`: explicit account/offline selection; authenticated study-pack PDF upload and bounded stage polling; saved-pack listing/selection and reload recovery; backend practice/battles, result review and persisted retry actions; account HUD, server-unlocked bridge and server-completed victory. Scene projection is separate from offline rules. Existing forest geometry, offline multiple choice, pointer lock, audio and controls were retained. No backend, engine, AI or `frontend/ui/` source was modified; no package installation, commit, push, merge, branch switch or discard was performed. The unrelated untracked `tatus --short` file remains untouched.

| Check | Actual result |
| --- | --- |
| `npm.cmd run build` | Passed; 69 modules, 910.18 kB main JS / 252.82 kB gzip. Existing >500-kB advisory remains. |
| `npm.cmd run lint` | Passed with no warnings. |
| `node --test tests/*.test.js` | All 76 passed, zero failures. |
| `git diff --check` | Passed; Git's Windows LF/CRLF notices remain. |
| Inspect production JS for developer tester entry/history/action strings | Absent. |
| Protected directories and package files | No diff under `backend/`, `Game_Engine/`, `ai_module/`, `frontend/ui/`, `package.json` or `package-lock.json`. |

The 13 added study-pack/account checks exercise authenticated multipart upload, indexing/writing/ready stages, duplicate-start suppression, selected practice/adventure IDs, read-only reload recovery, server failures, bounded polling/cancellation, ambiguous upload list recovery, schema validation, session expiry, stale-list fencing, mismatched document IDs, usable practice after failed adventure generation, and answer flags surviving failed follow-up reads. Existing tests retain pointer-lock races/fallback/cleanup, offline radios, deduplication, guest resets and rules, collisions, disposal, audio, admission denials and gameplay idempotency. The obsolete anonymous receipt transport check was updated to assert the authoritative authenticated contract; empty/204 pack responses are rejected.

Headless Chrome loaded the actual root Vite app with WebGL at 1366×768 and 1280×600. An **intercepted-contract flow, not a live backend**, passed registration/login, authenticated study-pack creation and processing stages, PDF-scoped numeric/radio practice, locked admission denial, 100-XP unlock, exact pending-question reload without mutations, all three current one-question villains, a deliberately lost answer response and identical-key/payload retry after reload, campaign completion at 70 XP, numeric account HUD, real pointer lock / modal release, focus containment and signout. The successful initial flow recorded 84 intercepted calls and zero JavaScript exceptions. These fixtures establish frontend behavior, not real PDF extraction, AI quality, authentication or live persistence. Scripts/screenshots live in ignored `.qa.local/account-*`.

The explicitly selected **offline guest route made zero API requests despite a configured backend URL**. Actual keyboard movement and native radio selection collected all five stories and cleared Goblin/Wolf; 100 XP opened the bridge and reached the hall. The long hall movement exceeded the inspection script's step budget; a continuation from the reached position completed all three dragon questions, with real pointer-lock release/reacquisition on close, reopen and completion, no combat help, intact 5/5 and 100 XP, zero observed exceptions and zero API resource requests in the visit. No progression or movement was bypassed to finish it. Screenshots include `.qa.local/account-guest-regression-dragon.png`.

The final account browser flow also walked the actual forest path across the server-unlocked bridge **with no guest collectibles**, entered the hall, walked to the completed dragon and princess, and verified their server-completion dialogue. No new gameplay mutations occurred during that traversal or victory review. Signout from the hall returned the locked account view to the forest. The complete 84-call intercepted run again passed with zero exceptions. Screenshot: `.qa.local/account-princess-victory.png`.

Live checks to `http://127.0.0.1:8000/healthz` and port 8796 failed to connect. `uv` is unavailable and the Windows `python.exe` shortcut cannot run; no dependencies were installed. This branch has no checked-out backend/engine. Consequently this task cannot verify live registration, CORS, actual PDF parsing / HTTP game-master generation, database restart durability or live battle outcomes. No hardware FPS benchmark, physical-device pointer-lock assessment or physical-speaker assessment is claimed. The frontend never falls back to fake/offline success after backend rejection.

A separate browser check with interception disabled attempted the actual unavailable API, displayed the real connection error without fabricated progress, and successfully switched to the explicitly selected offline landing. Zero JavaScript exceptions were observed. Screenshot: `.qa.local/account-real-connection-error.png`.

Vite emitted EBUSY watcher notices for locked files in the ignored temporary Chrome profile, plus development reloads while that profile initialized. These were inspection-environment warnings; build/lint/tests and the final browser flows passed. The test browser and Vite process were stopped after verification.

## Earlier courtyard integration — 2026-10-24

## Files changed for this task

Existing gameplay work was retained. Integration edits: `src/App.jsx`, `src/RoomExperience.jsx`, `src/AdventureMenu.jsx`, `src/AdventureHud.jsx`, `src/courtyardScene.js`, `src/PalaceDialog.jsx`, and `README.md`.

Added: `.env.example`; `src/api/client.js`, `gameSession.js`, `responseValidation.js`, `pollJob.js`; `src/forestGoblin.js`; `src/BackendGame.jsx`, `BackendTester.jsx`, `StudyMaterials.jsx`, `backend.css`; `tests/backend.test.js`; `docs/BACKEND_INTEGRATION.md` and this report. No changes were copied into `frontend/ui/`. Existing changes to `src/roomScene.js`, architecture, movement, design/plan documents and prior tests were preserved.

## Automated checks

| Command/check | Actual result |
| --- | --- |
| `npm.cmd run build` | Passed. Vite's >500-kB chunk advisory remains; the main bundle is about 851 kB (233 kB gzip). |
| `npm.cmd run lint` | Passed, no warnings in final run. |
| `node --test tests/*.test.js` | 36 passed: 18 existing checks and 18 integration checks. |
| `git diff --check` | Passed. Git printed existing Windows LF/CRLF conversion notices. |
| Inspect production JS for tester entry, history and tester-action strings | Absent. Tester module is excluded by `import.meta.env.DEV`. |

Integration tests use injected HTTP responses. They verify authenticated JSON, multipart boundaries, HTTP 204, structured error details, 401 handling, failed public login behavior, connection failures, timeouts, malformed responses, sanitized history, read-only pending-question restoration, double-submission guards, persisted retry keys/payloads across reload, invalid-answer correction, 5xx recovery, server admission denials, current-question reconciliation after replayed battle starts, session expiry, bounded job polling and character proximity/resource disposal. They do not prove that a live backend accepted these requests.

## Browser checks

A hidden headless Chrome instance loaded the actual root Vite app at `http://127.0.0.1:5173`. Local inspection scripts/screenshots are in ignored `.qa.local/`, not application code. These checks used the actual WebGL scene and existing keyboard controller:

- One canvas; recognizable green goblin with pointed ears, face, body, arms and legs visible in the courtyard.
- E at the spawn point did not open an encounter. Real keyboard walking reached the goblin, displayed its prompt, and E opened authentication. No battle was started on scene load.
- Tester was available before entering the courtyard; opening it made no mutations.
- Tester **GET /healthz** attempted the real local server and displayed a connection failure with no HTTP status. It did not display fabricated health data.
- Checked 1366×768 and 1280×600; account/encounter panel scrolls within the viewport and focuses an input. Background canvas is inert while dialogs are open. No JavaScript exceptions were observed.

A separate browser script intercepted backend requests with contract-shaped fixtures to exercise the frontend. It passed registration/login, five practice questions using numeric and multiple-choice inputs, XP/unlock HUD updates, E-triggered goblin battle entry, an intentionally lost answer response, retry with the identical payload/key, pending question restoration after reload, all three battle questions, victory feedback and sanitized developer history (65 intercepted API calls, no JavaScript exceptions). **This was not a real-backend playthrough.** No fixture/mock layer was added to the app.

Screenshots include `.qa.local/goblin-approach.png`, `goblin-dialog-laptop.png`, `backend-tester-offline.png`, and `browser-contract-victory.png` (the last uses intercepted responses).

Vite's development watcher emitted `EBUSY` notices for locked files in the temporary Chrome profile under `.qa.local/` during inspection. The test browser and Vite process were stopped afterward. These notices did not fail the build or browser assertions.

## Live-backend blocker and remaining limits

`curl.exe -sS --max-time 3 http://127.0.0.1:8000/healthz` failed to connect. `uv` was not available. `python --version`, including an approved check outside the sandbox, reported that Python was not installed (only a Windows Store shortcut); WSL was not installed either. This branch also has no checked-out backend or engine. Backend contracts and implementation were inspected from cached `origin/backend_and_engine` at `566a60a` without switching branches.

Therefore live health success, registration/login/logout, actual PDF validation/ingestion, question generation/polling, authenticated state, practice grading, battle initiation/outcome and live CORS preflight **could not be verified**. They need a checkout containing backend + Game_Engine and Python 3.12+/uv; follow `BACKEND_INTEGRATION.md`. Backend unit/lint/type checks were not run. No backend source or dependencies were modified.

Only Forest Goblin has a new world model. Subsequent villains are selected by the backend and named in the encounter dialog. The existing raised bridge, castle traversal, offline relic route and rescue are outside this integration. Real RAG, production auth hardening, a hardware performance benchmark, and manual pointer-lock playthrough on a physical desktop remain unverified. Existing controller tests cover pointer lock, drag fallback, pause/typing suppression, cleanup and the indoor recall rules; the new browser run used drag-look fallback.

No commit, push, merge, reset, clean, or discard was performed. No dependencies or frontend services were added.

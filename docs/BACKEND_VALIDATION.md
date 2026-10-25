# Integration validation — 2026-10-24

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

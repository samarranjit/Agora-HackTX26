# Mandatory Sign In → PDF → Play validation

## Git and implementation boundaries

Before editing, Git reported branch `feature/forest-guest-prototype`, no merge/rebase/sequencer state, no unmerged paths, and prior uncommitted simplification work. That work was adapted in place; no switch, merge, reset/discard, commit or push was performed. Root `.env.local`, API base configuration, ngrok header, protected backend/engine/AI code, dependency files and `frontend/ui/` were preserved.

## Actual player flow

1. Every opening/reload displays Sign In, with username/password, one primary Sign In button and a small Create account action. Registration switches forms and provides Back to Sign In. Both use the real auth endpoints. No PDF, home/welcome menu, guest/offline/demo route or tester is shown before authentication.
2. Successful login (or registration followed by login) goes directly to the upload screen with the requested title, upload instruction and drop target. File selection/drop submits immediately. Processing remains one screen; errors offer Retry. There is no confirmation or alternate processing path.
3. A ready pack is verified against its real question-set IDs, modes and document ownership, followed by real status/state/active-attempt reads. The forest becomes active automatically. Pedestals use the uploaded PDF's practice set; guardians use its adventure set. Questions/options, correctness, feedback, XP, numeric health, guardian order, unlocks and completion come from the backend.

The existing authentication/gameplay coordinator and question presenter were reused and narrowed to this journey. No duplicate auth service, fake questions, local scoring, tester/history UI or hidden entry mode was added. Tokens, selected file, processing identity and exact-key retries remain only in memory; reload returns to Sign In. Server-owned account progress remains server-owned and is not reset by the frontend.

## Automated results

| Check | Actual result |
| --- | --- |
| `node --test tests/*.test.js` | **47 passed, zero failed** |
| `npm.cmd run lint` | Passed without warnings after cleanup |
| `npm.cmd run build` | Passed; 54 modules; main JS 862.45 kB / 238.46 kB gzip |
| Build advisory | Existing >500-kB bundle advisory remains |
| Diff checks | Passed; Windows LF/CRLF conversion notices remain |

Coverage includes strict screen ordering, upload blocked before auth, public login/register JSON without a bearer, automatic registration/login/upload/processing/world transition, malformed/empty token rejection, auth errors and retry, registration-success/login-failure retry without duplicate registration, authenticated ngrok multipart transport, upload/provider failure, session expiry, cancellation fencing for late login responses, PDF-set and pending-attempt isolation, numeric and radio answers, server denial, exact-key ambiguous retry, duplicate submission prevention, world projection from server flags and no stored-session bypass. Existing controls, pointer-lock/fallback/races, typing/pause, movement, collisions, audio, particles and disposal checks remain.

## Browser checks: intercepted fixtures

Headless Chrome loaded the actual root Vite app with WebGL at 1366×768 and 1280×600. The final full campaign used **intercepted contract-shaped HTTP responses, not a live game master**. It passed:

- Sign In first even with the old `?demo=indoor` URL; zero initial API requests; Create account and Back to Sign In form switching.
- Registration then login, direct upload screen, one automatic multipart upload, processing, set/state loading and automatic forest entry without a confirmation/menu.
- Actual keyboard walking to a pedestal and native radio answer submission; five PDF-scoped questions reached 100 server-reported XP.
- Actual walking to both forest guardian markers, safe same-key/body retry after an intentionally lost battle-answer response, lowered bridge/castle entry, long hall traversal, Castle Dragon and princess completion. Server-reported victory remained valid at 70 XP after battle costs.
- Real pointer lock during deliberate world resume, modal focus, one canvas and reload returning to Sign In without recovery requests. No JavaScript exceptions were observed. The successful full fixture run recorded 150 API requests including preflights.

A separate error fixture browser run passed failed Sign In → Retry → upload, upload HTTP 503 → Retry, failed generation → Retry, and HTTP 401 during state loading → Sign In with no PDF/world exposed. It observed zero JavaScript exceptions. These fixtures are inspection scripts only; no fixture/mock layer was added to player code.

The inspection harness initially treated preflight requests as missing bearer authentication, which is expected for OPTIONS; that assertion was corrected before the final successful run. A separate initial error-harness reload race was corrected by waiting for navigation before filling the new form. Neither correction bypassed a product behavior.

Screenshots and scripts are ignored under `.qa.local/linear-*`, including `linear-sign-in.png`, `linear-upload.png`, `linear-contract-forest.png`, `linear-contract-feedback.png`, `linear-contract-princess.png`, and `linear-error-retry.png`.

## Live backend limitation

An initial real health request returned HTTP 200 with `{ "status": "ok", "game_master": "http" }`. A separate unintercepted browser attempt prepared a disposable test identity and repository PDF as validation inputs, but registration did not complete: the browser showed a connection error and Retry, and subsequent preflights from both localhost origins returned HTTP 404 `ERR_NGROK_3200` (tunnel offline). Therefore **live authentication, accepted PDF upload, real PDF generation, grading, progression and complete adventure success were not verified for this implementation**. No claim is made that the backend accepted a test account or uploaded PDF.

The current backend contract supports the authenticated routes used here, but the tunnel/service must remain online and CORS must permit the exact frontend origin and required headers. Existing limits remain: cumulative per-account progress rather than a per-PDF campaign reset; no cancellation endpoint for an older pending question (foreign-PDF attempts are blocked safely); no five-collectible completion/checkpoint API; current server-selected Goblin/Troll/Dragon campaign and 100-XP/30-XP rules. See [BACKEND_MODE.md](BACKEND_MODE.md).

## Files changed for this task

The manifest below compares file hashes against the working tree **at the start of this task**, rather than attributing all prior uncommitted simplification changes to this task. Inspection artifacts and ignored build output are excluded.

| Change | File |
| --- | --- |
| Updated | `docs/ACCOUNT_FREE_BACKEND.md` |
| Updated | `docs/ACCOUNT_FREE_PLAN.md` |
| Updated | `docs/ACCOUNT_FREE_VALIDATION.md` |
| Updated | `docs/BACKEND_INTEGRATION.md` |
| Updated | `docs/BACKEND_MODE.md` |
| Created/restored | `docs/LINEAR_FLOW_PLAN.md` |
| Created/restored | `docs/LINEAR_FLOW_VALIDATION.md` |
| Updated | `README.md` |
| Updated | `src/api/client.js` |
| Created/restored | `src/api/gameSession.js` |
| Removed | `src/api/guestBackend.js` |
| Updated | `src/api/pdfAdventure.js` |
| Updated | `src/api/responseValidation.js` |
| Created/restored | `src/BackendGame.jsx` |
| Updated | `src/ForestJourney.jsx` |
| Created/restored | `src/game/backendWorld.js` |
| Updated | `src/PdfLanding.jsx` |
| Updated | `tests/pdfAdventure.test.js` |

> Historical account-free experiment. The latest mandatory Sign In → PDF → Play requirement supersedes this record. See [LINEAR_FLOW_VALIDATION.md](LINEAR_FLOW_VALIDATION.md) and [BACKEND_MODE.md](BACKEND_MODE.md) for current behavior.

# Account-free frontend validation — 2026-10-25

The working root frontend is simplified; the complete backend adventure is blocked. See [the verified contract and exact backend owner changes](ACCOUNT_FREE_BACKEND.md). The implementation plan is [ACCOUNT_FREE_PLAN.md](ACCOUNT_FREE_PLAN.md).

## Working code

- One polished upload-only opening, exact requested copy, one PDF chooser/drop target. Selection/drop automatically validates and submits. There are no extra play/settings/account actions on the opening.
- Credential-free upload/polling transport, retained ngrok bypass header, browser-generated multipart boundary, structured errors and manual Retry. The file, processing ID and abort/retry state are page-memory-only. In-visit polling retry resumes a known job; ambiguous upload retry warns about duplicate submission.
- Account UI, tester, account/session coordinator, demo routing, offline question/reward reducers, sample questions and grading were removed. Retired browser-owned session/mode keys are deleted without reading them; unrelated storage is preserved. No values are saved or restored.
- The forest, castle, world builders, pointer-lock/drag fallback, motion, audio and scene cleanup remain. No gameplay or HUD is enabled before genuine anonymous backend admission. The legacy indoor demo has no route and is removed from the active renderer; pure geometry builders remain for regression checks.

## Explicitly blocked code

The verified API requires account authentication, and has no temporary anonymous adventure identity or game-state mapping. The frontend never bypasses this, creates an identity, uses a shared account, fabricates questions or awards progress.

`guestBackend.openAdventure` intentionally rejects even a ready pack. The future anonymous admission/game-action binding is not implemented against invented endpoints. Test doubles for the internal adapter exercise success transitions only in tests. A green transition test does not establish a functioning real guest backend. No real PDF generation, accepted answer, battle, or complete adventure succeeded in this task.

## Automated checks

`node --test tests/*.test.js`: **40 passed, zero failed**. New coverage asserts actual opening markup, automatic upload, indexing/writing/ready processing, ready-pack versus admission separation, injected successful world transition, failures/retries, malformed/HTML responses, live-shaped 401/403 rejection, size/type/header checks, timeout polling retry, stale-upload fencing, transport headers/cookie omission, no persisted state/alternate routes, and retirement of old keys. Retained checks cover pointer-lock races/fallback, movement/typing/pause, collision, audio, particles and resource disposal. Superseded account/offline rule checks were replaced, rather than retained as current product requirements.

`npm.cmd run lint`: passed without warnings. `npm.cmd run build`: passed, 52 modules, main JS 847.12 kB / 233.89 kB gzip. The existing >500-kB bundle advisory remains. Diff checks and preserved-file checks are recorded at completion below.

## Browser and live evidence

Headless Chrome loaded the actual root app with WebGL at 1366×768 and 1280×600. It verified the one-button opening, suppressed old `?demo=indoor` route, automatic upload through the real UI, retirement of old stored state, no requests on opening, a fresh PDF requirement after reload, error/Retry, focus containment, and one canvas. The real anonymous upload was rejected, with no fallback or account prompt. The tunnel was initially offline, later health returned HTTP 200 with HTTP game master, and live study-pack access returned HTTP 401. Live OpenAPI independently confirmed bearer requirements and absence of anonymous routes.

Separate intercepted responses exercised drop-to-upload, denied access, manual Retry, indexing, ready processing, and the still-blocked admission guard. They recorded no JavaScript exceptions. They do not prove real PDF extraction or gameplay. Screenshots/scripts are ignored under `.qa.local/account-free-*`.

The successful transition to enabled world rendering is tested through an injected in-memory adapter and actual React server rendering. It is not a live or player-selectable mode. Physical-device pointer lock, a hardware performance benchmark and subjective audio quality were not re-evaluated; the existing controller/audio checks remain green.

React's development hot reload emitted transient dependency-array-size warnings while the renderer's old effect signatures were replaced. The final browser checks navigated/reloaded the completed source and recorded zero JavaScript exceptions. The inspection browser and Vite process were stopped after validation.

## Preserved boundaries

`.env.local` and `src/api/config.js` are preserved; `.env.local` remains Git-ignored. No protected backend, engine, AI, dependency or `frontend/ui/` file was changed. No branch switch, merge, commit, push, package installation or discard was performed.

## Changed-file manifest

Generated from the final Git diff and new nonignored files; build outputs and inspection artifacts are ignored.

Final diff review: {"added":8,"modified":22,"removed":19}. Diff whitespace checks pass after removing two extra EOF blank lines; Windows LF/CRLF conversion notices remain. The production bundle contains no retired login/tester/sample-question UI strings. Root configuration, protected paths and dependency files have no diff.

| Change | File |
| --- | --- |
| Added | `docs/ACCOUNT_FREE_BACKEND.md` |
| Added | `docs/ACCOUNT_FREE_PLAN.md` |
| Added | `docs/ACCOUNT_FREE_VALIDATION.md` |
| Modified | `docs/BACKEND_INTEGRATION.md` |
| Modified | `docs/BACKEND_MODE.md` |
| Modified | `docs/BACKEND_VALIDATION.md` |
| Modified | `docs/FOREST_GUEST_PROTOTYPE.md` |
| Modified | `README.md` |
| Modified | `src/AdventureHud.jsx` |
| Removed | `src/AdventureMenu.jsx` |
| Modified | `src/api/client.js` |
| Removed | `src/api/gameSession.js` |
| Added | `src/api/guestBackend.js` |
| Added | `src/api/pdfAdventure.js` |
| Modified | `src/api/pollJob.js` |
| Modified | `src/api/profilePdf.js` |
| Modified | `src/api/responseValidation.js` |
| Modified | `src/App.jsx` |
| Removed | `src/BackendGame.jsx` |
| Removed | `src/BackendJourney.jsx` |
| Removed | `src/BackendTester.jsx` |
| Removed | `src/ForestChallenge.jsx` |
| Modified | `src/ForestJourney.jsx` |
| Modified | `src/forestLayout.js` |
| Removed | `src/game/backendWorld.js` |
| Modified | `src/game/forestContent.js` |
| Removed | `src/game/forestRun.js` |
| Added | `src/game/forestView.js` |
| Removed | `src/game/runState.js` |
| Modified | `src/main.jsx` |
| Removed | `src/memories.js` |
| Removed | `src/NotesPanel.jsx` |
| Modified | `src/PalaceDialog.jsx` |
| Modified | `src/PdfLanding.jsx` |
| Removed | `src/RecallQuiz.jsx` |
| Added | `src/retiredState.js` |
| Modified | `src/RoomExperience.jsx` |
| Removed | `src/StudyMaterials.jsx` |
| Removed | `src/StudyPackPanel.jsx` |
| Removed | `src/useCollectionPresentation.js` |
| Removed | `tests/backend.test.js` |
| Removed | `tests/choices.test.js` |
| Modified | `tests/courtyard.test.js` |
| Removed | `tests/forest.test.js` |
| Added | `tests/pdfAdventure.test.js` |
| Modified | `tests/phase1.test.js` |
| Modified | `tests/polish.test.js` |
| Modified | `tests/redesign.test.js` |
| Removed | `tests/studyPacks.test.js` |

# Mandatory authenticated PDF journey

The latest product requirement supersedes the account-free experiment. There is exactly one flow: Sign In or Create Account, PDF upload, processing, then play. No mode/hosting choice, landing menu, guest entry, sample data or developer tester is reachable.

## Implementation

The existing `gameSession` serialized gameplay coordinator and `BackendGame` question presenter were reused, adapted to the mandatory sequence. The shared client calls the real auth, study-pack, question-set, status/state, active-attempt, practice, battle and answer endpoints. It uses the page-memory bearer token, preserves the ngrok bypass header, omits cookies and lets the browser set the multipart boundary. Registration is followed by login; a failed auto-login after a confirmed registration can be retried without a second registration.

Authentication makes no question/game mutation and advances directly to the upload screen. Selecting a valid PDF submits once automatically. Upload/poll failures remain on that screen with Retry. A known processing ID is retained only for an in-visit polling retry. Failed generation deliberately reuploads on Retry. An ambiguous upload warns that retry can submit again because the API has no upload idempotency contract.

After processing, both real question-set receipts are checked for matching set IDs, modes and uploaded document ownership. The real player state and active attempt are loaded. Only then does the forest become active. Old pending questions outside those sets are blocked; no unrelated question is silently presented as part of the new PDF.

Pedestals start/resume practice for this PDF. Guardian interactions request the next server-selected battle using this PDF's adventure set. Multiple choice submits server option IDs and numeric questions use text. Server feedback appears only after grading. The server owns all balances, damage, unlocks and outcomes. Closing a question does not resolve it or award anything; pause can resume an outstanding question. The shared controller retains pointer lock, deliberate resume, drag fallback, modal input pausing and disposal.

Battle/answer actions are serialized and use one idempotency key per intended action. Ambiguous failures block new mutations until an explicit Retry reuses the exact key/body. Definitive invalid answers permit correction with a new key. Follow-up reads reconcile accepted state. Nothing is persisted across reload. Every opening starts at Sign In and requires another PDF; server-owned account progress is not reset or fabricated by the frontend.

## Backend limits

- The configured ngrok tunnel must stay online. A health success is not proof that a later authentication/PDF request will succeed. CORS must allow the exact frontend origin and Authorization, Content-Type, Idempotency-Key and ngrok-skip-browser-warning headers.
- Current account progress and the campaign are cumulative. There is no per-PDF campaign reset/cancel endpoint. An older pending attempt from another PDF cannot safely be discarded by the frontend and will block entry until the backend clears it. This is shown as an error with Retry.
- The current engine permanently unlocks adventure at 100 XP and charges 30 XP per battle. It selects Forest Goblin → Bridge Troll → Castle Dragon (difficulties 1/3/5, one question each under current defaults). No client XP, health, villain selection or forged completion is submitted.
- Forest landmarks remain reusable practice anchors. The backend has no five-collectible completion/reward or checkpoint API; fixed local per-object XP/heart rules are not substituted. The existing wolf artwork is a guardian marker, while the dialog always uses the actual server opponent name. Camera checkpoints are exploration state only.
- Real PDF questions require a working HTTP game master. Fake server mode is never selected by the frontend. There are no document/account deletion APIs for cleanup, and no frontend bypass for provider failures.

See [LINEAR_FLOW_VALIDATION.md](LINEAR_FLOW_VALIDATION.md) for actual checks and live limitations.

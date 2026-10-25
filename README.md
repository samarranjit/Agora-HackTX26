# Memory Palace

A Vite + React + Three.js fantasy PDF learning adventure. The only player journey is:

**Open → Sign In / Create Account → Upload PDF → Processing → Forest adventure.**

Sign In is always first, including reload and old query-string routes. Create account switches forms and uses the real registration/login API. Successful authentication goes directly to PDF selection; choosing/dropping a PDF uploads automatically. A ready question set and verified player state enter the preserved forest without another confirmation.

All questions, grading, XP, health, guardian battles and castle unlocks use the configured backend. No guest/offline/sample mode, API tester, request history or alternate entry UI exists. Credentials and in-visit retries stay in memory, never browser storage.

Run from the repository root with `npm.cmd run dev`. Root `.env.local`, `VITE_API_BASE_URL`, the ngrok header and the PDF size limit are preserved. `frontend/ui/` is not the active app and was not changed.

The backend must be online and allow the frontend's exact CORS origin. Current server rules and limitations are described in [BACKEND_MODE.md](docs/BACKEND_MODE.md). Live validation is distinguished from intercepted tests in [LINEAR_FLOW_VALIDATION.md](docs/LINEAR_FLOW_VALIDATION.md).

Checks: `node --test tests/*.test.js`, `npm.cmd run lint`, `npm.cmd run build`.

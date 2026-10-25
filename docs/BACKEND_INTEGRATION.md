# Backend integration

The only active root frontend journey is Sign In / Create Account → Upload PDF → Processing → Play. The account-free experiment and old mode menus are retired. See [current behavior and backend constraints](BACKEND_MODE.md) and [current validation](LINEAR_FLOW_VALIDATION.md).

The real endpoints remain `/api/auth/register`, `/api/auth/login`, `/api/study-packs`, `/api/study-packs/{document_id}`, `/api/question-sets/{question_set_id}`, `/api/me/status`, `/api/me/state`, `/api/me/active-attempt`, `/api/practice/attempts`, `/api/adventure/battles`, and `/api/attempts/{attempt_id}/answer`. Backend contracts were inspected directly from `origin/main`. No endpoint was invented or backend source changed.

Root `.env.local` and the ngrok header are preserved. Restart Vite after environment changes. Player UI exposes no API controls or history. Tokens, processing IDs and idempotent retry state are held only in memory. Reload never skips Sign In.

# Backend mode implementation

Contract fetched from `origin/main` at `d1a94f136f6a9dd87a9ad3b499e093c59fa8ce03` on 2026-10-24, without switching or merging branches. Read the game design, implementation plan, integration guides, frontend contract, OpenAPI, schemas, gameplay/study-pack routes, campaign, engine rules and AI service documentation directly with `git show origin/main:<path>`.

1. Complete the existing partial study-pack client: authenticated multipart upload, validated status/stages, bounded polling, list/select/recover after reload, clear failures and manual retry.
2. Add an explicit account mode to the root forest experience. Keep offline gameplay independent. Server questions, balances, health, unlocks, guardian order and completion control account gameplay; scene state is only a visual projection.
3. Preserve pointer lock, drag fallback, modal controls and existing guest rules. Run build, lint, all Node checks and available Chrome checks; record live versus intercepted validation separately.

API limits: no anonymous sessions, forest collectible completion/checkpoint/reset endpoints, deletion or frontend-selected villain/difficulty. Account mode uses PDF practice at story markers and the server campaign at guardian interactions. Guest rewards and resets are never submitted. Server unlock opens the account bridge; server completion controls the account victory. PDF generation requires the backend's HTTP game master; fake mode ignores PDF text.

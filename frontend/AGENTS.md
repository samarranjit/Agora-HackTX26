# Agora

- Persistent project preference: keep all frontend code, dependency manifests/lockfiles, Vite/lint configuration, HTML entry points, assets, tests, documentation, and local environment files inside `frontend/`. Do not recreate frontend tooling in the repository root.
- The active application is `frontend/src/`, with `frontend/index.html` and `frontend/package.json`. `frontend/ui/` is a legacy app; do not make new frontend changes there unless explicitly requested.
- Run installs and checks from `frontend/` (`npm.cmd ci`, `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd run dev`), or use `npm.cmd --prefix frontend ...` from the repository root. Keep the frontend independently installable when copied into its own repository.
- Preserve `frontend/.env.local` and the backend URL/ngrok header configuration; never commit local credentials. Older documents referring to root `src/` or root npm commands describe the layout before migration; use the paths above.
- Read `docs/GAME_DESIGN.md` and `docs/IMPLEMENTATION_PLAN.md` before gameplay work. Inspect actual files and `git status`; distinguish implemented behavior from proposals.
- Keep Vite + React + Three.js in JavaScript. Preserve the current playable room and controls during incremental migration. Do not add dependencies or services without task authorization.
- Keep gameplay rules/data separate from Three.js scene construction and per-frame movement. React owns progression; the renderer consumes state and emits events.
- Preserve WASD, pointer-lock and drag-look fallback, modal focus/close behavior, and paused input while typing. Dispose scene resources and listeners on transitions.
- Use charming low-poly storybook fantasy: royal colors, warm torches, atmospheric palace silhouettes, and a visible atrium. Avoid voxel/Minecraft styling and realistic AAA scope.
- Use the documented difficulty values. Award 5 XP once per completed relic; preserve earned learning progress on respawn. Never bypass backend checks: the reported 100-XP admission rule conflicts with Easy/Medium and needs teammate coordination.
- Run `npm.cmd run build` for application changes; use `npm.cmd run lint` and focused rule/browser checks as appropriate. Report warnings and unverified behavior. Respect planning-only tasks; do not implement the next phase unless asked.

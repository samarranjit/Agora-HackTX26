# Memory Palace

A Vite + React + Three.js fantasy PDF learning adventure. The only player journey is:

**Open → Sign In / Create Account → Select a saved study set or upload a PDF → Processing when needed → Forest adventure.**

Sign In is always first, including reload and old query-string routes. Create account switches forms and uses the real registration/login API. Successful authentication opens study-set selection; choosing/dropping a new PDF uploads automatically. A ready question set and verified player state enter the preserved forest without another confirmation.

All questions, grading, XP, health, guardian battles and castle unlocks use the configured backend. No guest/offline/sample mode, API tester, request history or alternate entry UI exists. Credentials and in-visit retries stay in memory, never browser storage.

This folder is the active, self-contained frontend. Source is in `src/`, static assets in `public/`, and Vite starts at `index.html`, which loads `src/main.jsx`. Vite reads configuration and environment files from this folder and builds into `dist/`. The older `ui/` folder is a legacy app; run commands here, outside `ui/`.

Install Node.js 24 with npm on the new device. The minimum supported Node version is 22.12.0; `.nvmrc` selects 24 when using nvm. No globally installed Vite or parent repository is required.

Clone your frontend-only GitHub repository, then open a terminal in its root (the folder containing `package.json`). If you cloned the full project instead, first run `cd frontend`. Install dependencies on that device:

```sh
npm ci
```

Create `.env.local` from `.env.example` once. In PowerShell:

```powershell
Copy-Item .env.example .env.local
```

On macOS or Linux:

```sh
cp .env.example .env.local
```

Skip the copy step if `.env.local` already exists. Edit `VITE_API_BASE_URL` in that file to point at your running backend, then start the frontend:

```sh
npm run dev
```

Open the local URL printed by Vite. On Windows, use `npm.cmd` instead of `npm` if PowerShell blocks npm's script. `VITE_PDF_MAX_MB` defaults to 20. Local environment files are ignored by Git. The existing ngrok bypass header remains in the API client.

The frontend starts and builds on its own, but signing in, uploading PDFs, and playing require the backend service. On another device, `127.0.0.1` refers to that new device: use it only if the backend also runs there. Otherwise configure a reachable backend URL and allow the frontend's exact origin in backend CORS. Restart Vite after editing `.env.local`; production builds embed the public `VITE_*` settings at build time, so rebuild after changing them.

You can also run `npm --prefix frontend run dev` from the full repository root. When publishing only this folder, include its dotfiles (`.gitignore`, `.nvmrc`, `.oxlintrc.json`, and `.env.example`), manifests, configuration, HTML entry, source, assets, tests, and docs. Install with `npm ci` after cloning; `node_modules/`, `dist/`, and `.env.local` are intentionally excluded. The active app lives directly in this folder; the older `ui/` app is not needed to run it.

The backend must be online and allow the frontend's exact CORS origin. Current server rules and limitations are described in [BACKEND_MODE.md](docs/BACKEND_MODE.md). Live validation is distinguished from intercepted tests in [LINEAR_FLOW_VALIDATION.md](docs/LINEAR_FLOW_VALIDATION.md).

Checks, from this folder: `npm test`, `npm run lint`, `npm run build`. Lint targets the active `src/` and `tests/` directories. `npm run preview` serves the production build. Older validation documents may refer to the previous root layout; resolve their frontend paths relative to this folder.

The parent repository also contains the backend (`../backend/`), game engine (`../Game_Engine/`), question-generation service (`../ai_module/`), and a standalone Phaser minimap (`../minimap/`). They are separate projects. The frontend calls the configured backend over HTTP and does not import code from these sibling folders. The minimap has its own package manifest and is not mounted in this adventure.

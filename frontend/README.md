# Agora — Frontend

Vite + React + Three.js client for Agora. It presents the Storywood and the castle.

**Sign in → choose or upload a PDF → walk the forest.**

`ui/` is a legacy prototype. Run everything from this folder, not `ui/`.

## Run

```sh
npm ci
cp .env.example .env.local    # set VITE_API_BASE_URL
npm run dev
```

Node ≥ 22.12. The backend must be up and must allow this origin in CORS.

Vite reads only a file named exactly `.env.local`. Restart `npm run dev` after editing it. `VITE_API_BASE_URL` must be a URL the browser can reach. For `*.ngrok-free.dev` the client adds `ngrok-skip-browser-warning`, which the backend allows in CORS. Open the app on `localhost` or `127.0.0.1` (ports 5173–5180, 3000 or 4173): the backend allows exact origins only.

```sh
npm test
npm run lint
npm run build
```

## Layout

```text
frontend/
├── index.html              entry; document title Agora
├── package.json            scripts: dev, test, lint, build
├── src/
│   ├── main.jsx            React mount
│   ├── App.jsx             renders ForestJourney
│   ├── ForestJourney.jsx   session, overlays, study flow
│   ├── BackendGame.jsx     sign-in, encounter, recovery
│   ├── PdfLanding.jsx      study-set library and upload
│   ├── RoomExperience.jsx  Three.js loop and input
│   ├── PalaceDialog.jsx    modal shell
│   ├── CharacterSpeech.jsx guardian dialogue
│   ├── AdventureHud.jsx    objective and notices
│   ├── playerControls.js   pointer lock, look, movement
│   ├── playerMotion.js     walk, jump, sprint
│   ├── forestLayout.js     world spots, collision, hall
│   ├── forestScene.js      forest and castle scenes
│   ├── forestContent.js    relic and guardian identities
│   ├── storybookProps.js   wolf, goblin, re-exports
│   ├── dragonModel.js      Storykeeper Dragon
│   ├── princessModel.js    princess
│   ├── modelKit.js         shared mesh helpers
│   ├── api/                HTTP client, session, validation
│   ├── game/               server world projection
│   └── audio/              story sounds
├── tests/                  node:test
├── docs/                   planning notes
└── ui/                     unused legacy app
```

Details: [BACKEND_MODE.md](docs/BACKEND_MODE.md).

## Characters

The dragon and the princess are built in code, not loaded from files. Both use `modelKit.js`: fixed parts are merged into a few vertex-coloured meshes, and elliptical tubes follow a path and are re-laid every frame so they bend, sway and flap.

| | Storykeeper Dragon | Princess |
|---|---|---|
| File | `dragonModel.js`, `createStoryDragon()` | `princessModel.js`, `createStoryPrincess()` |
| Detail | about 65,000 triangles (2.4× the first dragon), 22 units long | about 79,000 triangles (75× the first princess), 2.8 tall |
| Look | red back, orange flanks, white belly, horns and flame; wings glow red → orange → white | sculpted face, auburn hair, pink and lavender gown, jewelled tiara |
| Moves | wing beats every 5 s, fire every 11 s, looks around, embers from the mouth | breathes, blinks every 3.9 s, hair and gown sway, walks to the player |
| Contract | `{ root, update(time, defeated), mouth() }` | `{ root, update(time, walking) }` |

Both return a `root` the scene scales (1.8) and places. `update(0)` is the still pose used for reduced motion. All materials are listed in `root.userData.ownedMaterials` so `disposeScene` frees them. The dragon's no-walk circle is `HALL.dragon.radius` and the princess's is the 1.9 in `forestLayout.js`; widen them if a model grows.

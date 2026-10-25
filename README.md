# Agora

> Your notes are about to become your worst enemy. Or your greatest weapon.

Agora turns a study PDF into a first-person adventure. You walk a storybook forest, answer questions drawn from your own notes, and fight three guardians to free the princess. The server owns every question, grade, XP change, and victory. The browser only presents the world.

## Objective

Sign in, upload a PDF, and survive the Storywood using what you studied.

1. Practice beside forest relics until you unlock the castle.
2. Defeat the Forest Goblin, the Big Bad Wolf, and the Storykeeper Dragon — in that order.
3. Free the princess. The prison opens only after the dragon falls.

There is no guest mode and no invented questions. If the backend has not issued a challenge, the frontend does not start one.

## How you play

| Step | What happens |
| --- | --- |
| Sign in / create account | Required first. Credentials stay in memory for the visit. |
| Choose a study set | Continue a saved pack or upload a new PDF (max 20 MB). |
| Wait for processing | The game master indexes the PDF and writes questions. |
| Walk the forest | WASD move, mouse look, Space jump, Shift sprint, E interact, Esc pause. |
| Practice | Approach a relic and answer. Correct answers earn XP and restore health. |
| Unlock the castle | Adventure unlocks permanently at 100 XP. The drawbridge then lowers. |
| Battle | Approach a present guardian. One question, one correct answer wins. |
| Rescue | Defeat the dragon, then speak with the princess. |

## Game rules

Rules live only in `Game_Engine`. The backend applies them. The frontend never computes XP, health, costs, or outcomes.

| Rule | Default |
| --- | --- |
| Start | 0 XP, 100 health (cap 100) |
| Difficulty | Integer 1–5, taken from the stored question |
| Correct practice | +10 / 15 / 20 / 25 / 30 XP by difficulty; +5 health, up to the cap |
| Wrong practice | No XP or health change |
| Adventure unlock | 100 XP, permanent |
| Battle entry | 30 XP, charged once when the fight starts |
| Correct battle | Completes the villain; no bonus XP |
| Wrong battle | −2 × difficulty XP, −5 × difficulty health (neither below 0) |
| Questions to win | 1 question, 1 correct answer |
| Health reaches 0 | Battle ends as a knockout. Entry fee is not refunded. Practice to recover. |
| Villains | Forest Goblin (1) → Bridge Troll / Wolf (3) → Castle Dragon (5) |

A host may override starting XP and the practice/battle economy through backend environment variables. Those overrides do not change villain order or who is allowed to invent a win.

## Architecture

```text
Browser (frontend) ── HTTPS + bearer token ──▶ Backend ── RAG contract ──▶ Game master (ai_module)
                                                 │
                                                 └── Game_Engine (pure rules, no I/O)
```

- **frontend** — Vite + React + Three.js. Walking, speech, and animation only.
- **backend** — FastAPI. Accounts, PDFs, grading, persistence. One engine action per request.
- **Game_Engine** — XP, health, unlocks, battles. Standard library only.
- **ai_module** — Gemini game master. Writes questions. Never changes player state.
- **minimap** — Standalone Phaser sketch. Not mounted in the adventure.
- **output** — Sample artifacts from the question pipeline.

## Run

```sh
# Game master (optional; required for real PDF questions)
# set GEMINI_API_KEY and RAG_API_KEY, then:
python -m ai_module.service

# Backend
cd backend && uv sync --locked
uv run --env-file .env learning-game-api serve

# Frontend
cd frontend && npm ci
cp .env.example .env.local   # set VITE_API_BASE_URL
npm run dev
```

Package names (`learning-game-api`, `learning-game-engine`) are unchanged. See each folder README for layout and checks.

## License

Private course / hackathon project.

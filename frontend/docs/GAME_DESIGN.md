# Memory Palace: fantasy learning adventure

## Status and scope

Planning baseline: 2026-10-24, commit `c48139e` (`Build initial Memory Palace prototype`). Git status was clean before this documentation work. The files below were inspected directly; this is not an assumption that the target adventure already exists.

`npm.cmd run build` succeeds (Vite 8.3.5, 26 modules). The main JavaScript bundle is approximately 771.98 kB, 207.97 kB gzip, and triggers Vite's greater-than-500-kB advisory. No browser playthrough or performance benchmark was run for this planning review; source inspection and build success do not establish runtime correctness.

This change creates planning documents only. The adventure described after the inventory is proposed. Implementation initially stays offline with deterministic sample data. AI, backend requests, authentication, multiplayer, room decay, and new packages are outside the initial phases.

## Verified existing systems and reuse

| Actual file | What exists | Reuse and required adaptation |
| --- | --- | --- |
| `src/App.jsx` | Notes draft; loaded/unlocked flags; session and discovered IDs; notes/quiz/pause/completion overlays; replay cycles three questions | Keep UI coordination; migrate progression to an explicit reducer. A single `unlocked` flag cannot represent bridge, floors, enemies, and rescue. |
| `src/RoomExperience.jsx` | Three.js lifecycle, animation loop, capped delta time and pixel ratio, resize observer, WASD with normalized diagonals, yaw/pitch mouse look, pointer lock and drag fallback, blur/visibility pause, input clearing, resource cleanup | Preserve control behavior; separate player/input and interaction systems from rendering. Camera Y is forced to 1.6, so climbing/falling does not exist. |
| `src/roomScene.js` | 12-unit indoor room, ceiling, warm lighting/fog, three pedestals, hinged door, landing; XZ boundary and pedestal collision; narrow unlocked exit | Retain as the legacy regression scene. Reuse construction conventions, gate animation, and collision concepts; current room clamp is not a general courtyard/floor collision system. |
| `src/memoryObjects.js` | Procedural orange power bean, purple crowned vault, turquoise chef, with stable memory IDs in `userData` | Reuse playful silhouettes and metadata; pool geometry/materials for larger populations. |
| `src/memories.js` | Three biology facts with titles, cues, shapes/colors, questions, hints, alternative answers | Reuse content schema and case/trim/internal-whitespace normalization. Add unique relic/encounter IDs independently of fact IDs. |
| `src/NotesPanel.jsx` | Controlled textarea; Create Memories and Load samples again call the same sample loader; explicit reset | Keep notes entry and honest sample-mode explanation; add difficulty selection later. Notes are not interpreted or transmitted. |
| `src/PalaceDialog.jsx` | Modal labeling, preferred input focus, Tab wrapping, Escape handling, visible close action and focus restoration | Reuse shared shell for relics/combat/pause. Audit background focus access during future work; `aria-modal` alone does not make background controls inert. |
| `src/RecallQuiz.jsx` | Typed answers, retry feedback, success and close controls; success directly calls `onUnlock` | Retain existing door mode; extract a question presentation/result interface for relic and combat contexts. It currently has no health/damage logic. |
| `src/App.css`, `src/index.css`, `src/main.jsx` | Full-screen HUD/dialog styles, laptop-height scrolling rules, React StrictMode entry | Reuse overlay layering and responsive patterns. Generalize hardcoded biology-room copy and three-item counters. |

Current loop: load samples, approach objects for labels/facts, press E near the door, answer one question, unlock it, cross the landing to complete. Visiting objects is optional and grants nothing. Replay resets the room and advances the question. Refresh loses all state. Three sample facts are not yet a 5/10/20-relic collection system. There is no courtyard, moat, drawbridge, atrium, reusable floor generator, gravity, checkpoint, enemy, dragon, princess, XP, health, network client, or checked-in automated test suite.

## Experience and world layout

The player is a learner-adventurer restoring a royal palace through remembered knowledge. Learning objects have memorable identities and spatial homes. Correct recall creates visible changes in the world.

Proposed route:

1. Choose difficulty and load sample study content. Arrive in an outdoor royal courtyard on a palace island surrounded by a moat. The keep rises overhead; a moat channel at its entrance gives the drawbridge a meaningful crossing.
2. Explore distinct courtyard landmarks, inspect mnemonic relics, and complete their learning questions. Successful challenges collect the relics and fill the XP meter.
3. Complete the difficulty's relic collection and XP target to lower the drawbridge. Cross into the keep; the open central atrium reveals balconies, stairs, and the distant summit.
4. Ascend reusable floors. Each non-final floor has one knowledge-based enemy guarding the next stair. Floor-entry checkpoints restore the player's hearts.
5. Face the dragon on the final floor. Defeat it through correct recall, then interact with the princess to rescue her and finish the adventure.

Floors mean total playable castle levels, including the dragon's final level: Easy has four ordinary enemy floors plus the summit, Medium six plus summit, Hard eight plus summit. This counting is a proposed implementation convention, not existing code.

## Difficulty and progression rules

| Difficulty | Required relics | Total castle floors | Relic XP target | Hearts per floor enemy | Dragon hearts |
| --- | ---: | ---: | ---: | ---: | ---: |
| Easy (initial selection) | 5 | 5 | 25 | 3 | 5 |
| Medium | 10 | 7 | 50 | 4 | 10 |
| Hard | 20 | 9 | 100 | 5 | 20 |

Player maximum health is always **3 hearts**, restored at floor checkpoints. Each correctly completed relic challenge grants **5 XP once**; collection count and XP therefore reach their thresholds together. Inspecting, wrong answers, repeating completed relics, combat answers, and replaying submitted events grant no additional XP. XP is derived from completed unique relic IDs, not mesh visibility or a mutable animation counter. Select difficulty before starting; changing it starts an explicit new run.

Proposed rules where the request leaves details open:

- A relic first exposes its fact and visual cue. E opens its question. Blank submissions do not resolve a turn; wrong answers give feedback and allow retries without heart loss. A correct answer marks the relic complete, grants XP once, and leaves a recognizable completed display for later review.
- Bridge eligibility requires both all required relic IDs completed and XP at the configured target. Show progress and a clear lowered/open state; enable crossing only once the bridge is safely down.
- Combat is turn-based recall, without reflex timing. Each accepted correct answer removes one enemy heart; each accepted wrong answer removes one player heart. Blank answers do neither. Show both health values and explanatory feedback. A resolved question requires an explicit next-turn action; double clicks or repeated Enter cannot apply damage twice.
- Questions draw from already studied content, with deterministic rotation for sample mode. Retries on long encounters may revisit facts; tell the player this is practice. Extend the fixtures to 20 unique relic placements/challenge IDs before Hard is offered. Repeated facts must be intentional and labeled, not presented as newly generated notes content.
- Defeating an ordinary enemy unlocks its stair. Reaching the next floor commits a checkpoint and restores three hearts. Completing the dragon encounter enables rescue; victory requires the rescue interaction, not just reaching the top.
- At zero hearts, respawn at the courtyard start or latest floor checkpoint, restore three hearts, and reset only the unfinished encounter to full enemy health. Defeated enemies, relics, XP, unlocked routes, and learning history survive.
- Falling into the moat or atrium triggers the same safe respawn without an additional heart charge. Reset an unfinished encounter on that floor consistently. Do not reset earned learning progress or start a new run. Recovery must place the player on safe supported ground, outside the hazard trigger.
- Closing a challenge or pausing does not cause an attack, reward, or encounter reset. Reopening resumes its unresolved question/feedback and current health. Only an explicit reset/new run clears progress. Persistence across browser reloads is deferred.

## Art direction and performance

Use charming retro storybook fantasy with low-poly tapered towers, sweeping roof silhouettes, broad arches, readable crenellations, illustrated banner/sign details, and playful characters. Favor royal blue, plum, crimson, cream stone and gold, with amber torchlight and cool teal moat water. Avoid cubic voxel terrain, Minecraft-like repetition, realistic PBR asset expectations, and AAA visual effects.

The first courtyard view should establish an enormous palace silhouette, a raised bridge, colorful relic landmarks, and atmospheric depth. Inside, keep the central atrium visually open: repeated galleries and stairs communicate ascent, with railings/colliders where intended and explicit fall zones elsewhere. Reuse structural modules while varying banners, landmarks, and light color so floors remain distinguishable.

Start with primitive geometry and small procedural sign/flame details, shared materials, instancing for repeated columns/torches, opaque stylized water, fog and a single primary shadow light. Torch glow can use emissive meshes or billboard details rather than a shadow-casting light per torch. Keep the current pixel-ratio cap at 2; prioritize render budget over decorative mesh count. Keep distant floors as simplified silhouettes and activate detailed encounters only near the current floor. No postprocessing or physics package is needed for the first slice.

Proposed performance acceptance: sustained median at least 30 FPS during a 60-second 1366x768 courtyard-to-floor traversal on a recorded representative integrated-GPU laptop; report hardware/browser, resolution and render statistics. Benchmark Hard as well as Easy. This is a target, not a measured baseline. Avoid growing draw calls/resources over ten scene changes or resets.

## UI and input

Retain WASD, mouse pointer lock, drag-to-look fallback, E interaction, and Escape pause/release. Display the current objective, relic count/target, XP/target, floor number, player hearts, and encounter hearts when relevant. Use text/icons as well as color for gate and damage states.

Opening notes, a relic challenge, combat or pause clears held keys, suspends movement/look, and releases pointer lock. Focus the answer input, contain keyboard focus in the dialog, make background actions inactive, and provide a visible return-to-world action. Resume requires deliberate input; no accumulated movement or damage should occur. Test at 1366x768 and 1280x600; touch navigation remains out of scope.

## Backend contract issue: unresolved and blocking integration

The user reports that the backend adventure endpoint currently requires **100 XP**. No endpoint implementation, route, schema, or network client exists in this repository to verify that contract. Easy can legitimately earn only **25 XP**, Medium **50 XP**, and Hard **100 XP** from the required relics. Easy and Medium cannot satisfy that server rule.

Coordinate with the backend teammate before enabling integrated adventure admission. Agree which transition the endpoint controls (adventure creation, keep entry, or another gate), difficulty-aware thresholds, ownership of XP, validated challenge completion evidence, request/response fields, contract version, and error/retry/idempotency behavior. Preferred proposal: the server validates the selected difficulty and its 25/50/100 threshold with authoritative completion evidence. This requires teammate agreement; it is not an assumed server change.

Never inflate submitted XP, silently change difficulty/defaults, remove checks, pretend a server denial is success, or fall back to offline success after a rejection. An explicitly selected offline sample adventure may demonstrate the intended rules without making calls. Integrated mode must visibly remain unavailable for unsupported difficulties until the contract is reconciled; even Hard needs verified server admission, not just local eligibility.

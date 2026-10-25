# Memory Palace

A Vite + React + Three.js fairy-tale adventure. The default environment is the Storywood: a winding uphill forest trail, five hidden collectibles, a castle drawbridge and one dragon hall. It is an explicitly offline, temporary guest prototype. The earlier courtyard and indoor recall demo are preserved as development routes.

## Run

```powershell
npm.cmd install
npm.cmd run dev
```

Open the local URL printed by Vite (normally http://localhost:5173). Use a desktop browser with WebGL. The active frontend is root `src/`; `frontend/ui/` remains the packaged snapshot.

## Play the forest guest adventure

Choose **Begin offline guest adventure**, follow the uphill trail and explore the branches marked by lanterns and stepping stones. Press **E** near a fairy-tale item to start its three-question challenge. Every prompt is `*filler question*`; type `answer` for the placeholder answer and choose **Learn more** for `filler explanation`.

Each completed item awards **20 prototype XP once** and a checkpoint. Collect all five to reach **100 XP**, lower the bridge and enter the dragon hall. Each wrong answer removes one of three hearts. The third mistake fully resets the run, including every item, XP, checkpoint and castle unlock. Closing a dialog does not heal or erase partial challenge progress. Medium is the only difficulty.

No login, account, upload or backend request is used by the default guest adventure. Refreshing or leaving ends the run. The developer-only API tester remains available separately. See [the forest guide and backend guest handoff](docs/FOREST_GUEST_PROTOTYPE.md) for details and limitations; existing account-based API instructions are in [the backend guide](docs/BACKEND_INTEGRATION.md).

## Explore the preserved courtyard (development)

Open `/?demo=courtyard` while running the Vite development server for the previous courtyard/API implementation.

1. Open the app and click **Enter courtyard**. This deliberate click requests pointer lock. If your browser declines, drag with the left mouse button to look, or click **Lock mouse** to retry.
2. **WASD** moves relative to your view. **Space** jumps when grounded; holding/repeating it does not enable flight. **Shift + WASD** sprints while stamina remains. Walk or rest to recover; release Shift after exhaustion before sprinting again.
3. **Esc** opens pause and releases the mouse. Click **Resume exploration** to return and request pointer lock again. Switching tabs pauses the game too.
4. Explore around the fountain and gardens. Solid walls, benches, tower bases and the palace block movement. At the north edge, the gate notice explains that the drawbridge remains raised.
5. Walk off the central northern edge into the moat, or through the eastern overlook opening. Falling returns you to the starting spawn with motion cleared. This does not reset difficulty, learning progress or the indoor demo.
6. The sword is a decorative camera prop. Walk forward/right to the Forest Goblin and press **E** nearby to challenge. Sign in and prepare study questions from the menu, then practice to meet the backend's admission rules. Signed-in XP, health and unlocks come from the backend; guest hearts remain exploration state. The bridge and castle floors remain unavailable.

Check at 1366 x 768 and 1280 x 600. Menus should scroll when necessary, contain keyboard focus and suppress gameplay keys. The moat remains unsupported even during a sprint-jump; the palace is not accessible yet.

## Test the indoor recall loop (development)

Choose **Visit the indoor recall demo** from the development menu or open `/?demo=indoor` directly. Use the **Courtyard** button during indoor exploration to visit the preserved courtyard. Open `/` for a fresh forest guest run.

1. Paste any notes in the setup panel. Click **Create Memories** (or **Load samples again**). This always loads three hardcoded biology facts; notes are not processed.
2. Use **WASD** to move. Hold the left mouse button and drag to look, or click **Lock mouse** for free mouse look. **Esc** pauses and releases the mouse. In the initial view, the objects are ahead of you.
3. Approach all three pedestals. Check each label, fact, and mnemonic cue: orange ATP power bean (left), purple DNA royal vault (center), turquoise protein chef (right). The visited counter should reach 3/3.
4. Turn around and approach the original wooden door. **E** opens the quiz when you are nearby. You can also back toward the door with **S** from the initial view.
5. Type an incorrect answer and submit: the gate stays locked, feedback appears, and another attempt is allowed. Type WASD letters in the answer field to verify that typing does not move the player. **Close quiz & keep exploring**, the close icon, or **Esc** returns to the room. Approach the door and press **E** again to retry.
6. On the first run, answer `ATP` or `adenosine triphosphate`. Try mixed capitalization and surrounding spaces, such as `  aTp  `. Submit with the button or **Enter**. Success feedback appears and the door turns green and swings open.
7. Click **Return to room & walk through**. Move through the doorway to the landing; a completion panel appears.
8. **Play again** resets your position, visited count, and gate, and advances to the next sample question. The second question accepts `nucleus` or `the nucleus`; the third accepts `protein`, `proteins`, or `polypeptides` (see `src/memories.js` for all alternatives).
9. Open **Notes & samples** (release the mouse with **Esc** first if locked). Notes persist during replays. **Load samples again** restarts the challenge. **Reset room & clear notes** clears the draft and removes the memories, returning to setup. Refreshing the page also clears all state.
10. Check at 1366 x 768 and at a shorter laptop height: dialogs scroll, their close buttons remain accessible, and Tab stays inside the open dialog.

## Structure

- `src/ForestJourney.jsx`, `src/ForestChallenge.jsx`, `src/game/forestContent.js`, `src/game/forestRun.js`: default guest adventure and reusable three-question collectible progression.
- `src/forestLayout.js`, `src/forestScene.js`, `src/storybookProps.js`: terrain/collision, uphill forest, entrance animation, fairy-tale items and dragon hall.

- `src/App.jsx`: sample session state, backend session subscription, quiz progression, overlays, completion.
- `src/api/`: shared backend client, response checks, serialized gameplay requests, saved retry keys, bounded polling.
- `src/BackendGame.jsx`, `src/StudyMaterials.jsx`, `src/BackendTester.jsx`: authentication, practice/battle questions, PDF preparation, development-only real API controls/history.
- `src/forestGoblin.js`: procedural courtyard character and interaction range; no network logic.
- `src/RoomExperience.jsx`: shared renderer/controller lifecycle for both environments, proximity labels, HUD coordination and cleanup.
- `src/roomScene.js`: the preserved room, lighting, pedestals, hinged door, exit landing, collision rules.
- `src/courtyardScene.js`, `src/palaceArchitecture.js`, `src/scenePrimitives.js`: procedural gardens, moat, palace architecture, instanced geometry/material reuse and lighting.
- `src/courtyardLayout.js`: shared structure footprints, walkable ground, collisions and moat/out-of-bounds detection.
- `src/playerControls.js`, `src/playerMotion.js`: shared input/pointer lock; courtyard-only jumping, gravity, sprint stamina and safe respawn.
- `src/sceneResources.js`, `src/swordProp.js`: shared resource disposal and the decorative camera-mounted sword.
- `src/AdventureMenu.jsx`, `src/AdventureHud.jsx`, `src/adventure.css`: courtyard start/pause menu, objective, hearts and stamina display.
- `src/game/difficulty.js`, `src/game/runState.js`: preserved earlier difficulty configuration and legacy run state; the forest uses its own scoped progression reducer.
- `src/memoryObjects.js`: three procedural, colorful mnemonic characters.
- `src/memories.js`: sample facts, imagery metadata, questions, answer alternatives, normalization.
- `src/NotesPanel.jsx`, `src/RecallQuiz.jsx`, `src/PalaceDialog.jsx`: notes UI, recall UI, shared focus-managed modal.
- `src/App.css`: responsive controls, HUD, panels, and feedback styles.

## Validation

```powershell
npm.cmd run build
npm.cmd run lint
node --test tests/*.test.js
```

The production build may report Vite's bundle-size advisory because Three.js is included in the main bundle.

## Prototype and legacy limits

- The forest uses the requested filler content and local, temporary prototype progress. The indoor demo uses biology samples; its pasted notes are never sent. The separate developer/account Study material flow uploads a selected PDF; fake backend mode ignores its text.
- The indoor demo opens its door after one correct recall. The forest requires three correct questions for each item and all five items to open the castle.
- Offline answer checking uses explicit alternatives with normalized case and whitespace, not semantic grading. Backend tester answers are graded by the actual server.
- Forest and indoor sample progress reset on refresh. The preserved courtyard's account integration uses sessionStorage and backend persistence; the forest never resumes that account. No multiplayer or room decay.
- Desktop keyboard and mouse controls; touch navigation is not implemented. Pointer lock availability depends on the browser, with drag-to-look as a fallback.
- The forest implements the five-item bridge and one dragon hall as an offline prototype. Server guest sessions, authoritative collectible progression, multiple floors and rescue remain unavailable. The preserved courtyard's backend goblin flow still follows the server's own admission rules. See the forest guest handoff for the required backend changes.

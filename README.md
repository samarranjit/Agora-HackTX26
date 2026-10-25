# Memory Palace

A Vite + React + Three.js fairy-tale adventure. A PDF landing page leads into the Storywood: a seeded uphill forest, five hidden collectibles, Goblin and Big Bad Wolf encounters, a drawbridge and an enormous dragon throne hall with a princess. Choose offline guest gameplay or authenticated PDF learning with server-saved progress and battles. The earlier courtyard and indoor recall demo are preserved as development routes.

## Run

```powershell
npm.cmd install
npm.cmd run dev
```

Open the local URL printed by Vite (normally http://localhost:5173). Use a desktop browser with WebGL. The active frontend is root `src/`; `frontend/ui/` remains the packaged snapshot.

## Play the forest guest adventure

Choose/drop a PDF and **Continue with this PDF locally**, or explicitly **Explore the guest demo without a PDF**. By default PDF processing is disconnected; selection sends nothing and the file stays in memory for this visit. Follow the uphill trail and branches marked by lanterns and stepping stones. Press **E** near an item for its three-question challenge. Every prompt is `*filler question*`; select `answer` from the labeled placeholder choices and submit it. The other placeholder choices exercise incorrect-answer feedback. **Learn more** reveals `filler explanation` for collectibles only.

Each completed item awards **20 prototype XP once** and a checkpoint. Collect all five to reach **100 XP**, lower the bridge and enter the dragon hall. Each wrong answer removes one of three hearts. The third mistake fully resets the run, including every item, XP, checkpoint and castle unlock. Closing a dialog does not heal or erase partial challenge progress. Medium is the only difficulty.

The Goblin can appear after two completed items; the Big Bad Wolf follows farther along the route. Each asks one starter-tier question, awards no XP and shares the same hearts. Goblin, Wolf and the final three-question dragon encounter offer no help; collectible explanations remain available. New runs change item positions and scenery while preserving clear routes. Pedestal bases are solid. The castle's long hall leads to the dragon guarding a separately visible princess on a raised throne area.

Items spin and float on illuminated pedestals, with brief collection sparkles. Walking adds stronger vertical camera bob, subtle sideways sway and louder synchronized footsteps. **Sound on/off** is available in the world and every dialog; procedural audio starts only after a real click or keyboard activation. Your system's reduced-motion preference disables camera motion and reduces decorative effects. Gameplay also works without audio support.

Starting or intentionally resuming exploration requests pointer lock on the game canvas. Menus and questions release it; closing them requests it again without moving or turning the player. Escape can force a browser unlock. If the browser declines reacquisition, click the canvas or **Resume mouse look** once, or use drag-look. There is no mouse-unlock button. Choices use native radio controls with keyboard selection and explicit submission.

Guest gameplay requires no login and makes no backend requests, even when account mode is configured. Refreshing or leaving ends the guest run and clears the selected file. The developer-only API tester remains available separately. See [the forest guide](docs/FOREST_GUEST_PROTOTYPE.md).

## Learn from a PDF with saved account progress

Set `VITE_API_BASE_URL` to the running backend URL in root `.env.local` and restart Vite. Blank/unset means offline-only. Choose **Sign in / register** on the landing, then explicitly upload a PDF under **Prepare PDF questions**. The authenticated study-pack endpoint prepares both practice and adventure sets; the UI shows processing stages, errors, saved PDFs and resumed polling. `VITE_PDF_MAX_MB` defaults to 20.

Story pedestals offer server practice from the selected PDF; guardian interactions request the server's next opponent. Numeric answers and multiple-choice option IDs are graded by the backend. Account XP, numeric health, unlocks and victories come only from backend responses. The current server permanently unlocks adventure at 100 XP, charges 30 XP per battle, and selects Goblin → Troll → Dragon. Account bridge access follows the server unlock. Reload restores pending questions and saved retry keys without starting a new battle. Offline guest progress stays independent.

Real PDF questions need the backend's HTTP game master; fake mode ignores PDF text. Anonymous backend sessions, forest collectible/checkpoint persistence and PDF deletion are absent from the contract. See [account-mode setup, behavior, recovery and API limits](docs/BACKEND_MODE.md).

## Explore the preserved courtyard (development)

Open `/?demo=courtyard` while running the Vite development server for the previous courtyard/API implementation.

1. Open the app and click **Enter courtyard**. This deliberate click requests pointer lock. If your browser declines, drag with the left mouse button to look, or click **Resume mouse look** to retry.
2. **WASD** moves relative to your view. **Space** jumps when grounded; holding/repeating it does not enable flight. **Shift + WASD** sprints while stamina remains. Walk or rest to recover; release Shift after exhaustion before sprinting again.
3. **Esc** opens pause and releases the mouse. Click **Resume exploration** to return and request pointer lock again. Switching tabs pauses the game too.
4. Explore around the fountain and gardens. Solid walls, benches, tower bases and the palace block movement. At the north edge, the gate notice explains that the drawbridge remains raised.
5. Walk off the central northern edge into the moat, or through the eastern overlook opening. Falling returns you to the starting spawn with motion cleared. This does not reset difficulty, learning progress or the indoor demo.
6. The sword is a decorative camera prop. Walk forward/right to the Forest Goblin and press **E** nearby to challenge. Sign in and prepare study questions from the menu, then practice to meet the backend's admission rules. Signed-in XP, health and unlocks come from the backend; guest hearts remain exploration state. The bridge and castle floors remain unavailable.

Check at 1366 x 768 and 1280 x 600. Menus should scroll when necessary, contain keyboard focus and suppress gameplay keys. The moat remains unsupported even during a sprint-jump; the palace is not accessible yet.

## Test the indoor recall loop (development)

Choose **Visit the indoor recall demo** from the development menu or open `/?demo=indoor` directly. Use the **Courtyard** button during indoor exploration to visit the preserved courtyard. Open `/` for a fresh forest guest run.

1. Paste any notes in the setup panel. Click **Create Memories** (or **Load samples again**). This always loads three hardcoded biology facts; notes are not processed.
2. Use **WASD** to move. Loading the room requests pointer lock; **Resume mouse look** or dragging is available if the browser declines. **Esc** pauses and releases the mouse. In the initial view, the objects are ahead of you.
3. Approach all three pedestals. Check each label, fact, and mnemonic cue: orange ATP power bean (left), purple DNA royal vault (center), turquoise protein chef (right). The visited counter should reach 3/3.
4. Turn around and approach the original wooden door. **E** opens the quiz when you are nearby. You can also back toward the door with **S** from the initial view.
5. Select an incorrect option and submit: the gate stays locked and feedback appears. Choose **Try this question again** to select anew. Radio choices work with Tab, arrow keys and Space; gameplay remains paused. **Close quiz & keep exploring**, the close icon, or **Esc** returns to the room and requests pointer lock. Approach the door and press **E** again to retry.
6. On the first run, select **ATP** and submit. Success feedback appears and the door turns green and swings open. The accepted-answer data remains unchanged; the interface now submits the selected value.
7. Click **Return to room & walk through**. Move through the doorway to the landing; a completion panel appears.
8. **Play again** resets your position, visited count, and gate, and advances to the next sample question. Select **Nucleus** for the second and **Proteins** for the third (see `src/memories.js` for the unchanged accepted alternatives).
9. Open **Notes & samples** (release the mouse with **Esc** first if locked). Notes persist during replays. **Load samples again** restarts the challenge. **Reset room & clear notes** clears the draft and removes the memories, returning to setup. Refreshing the page also clears all state.
10. Check at 1366 x 768 and at a shorter laptop height: dialogs scroll, their close buttons remain accessible, and Tab stays inside the open dialog.

## Structure

- `src/ForestJourney.jsx`, `src/ForestChallenge.jsx`, `src/game/forestContent.js`, `src/game/forestRun.js`: default guest adventure and reusable three-question collectible progression.
- `src/MultipleChoiceAnswer.jsx`: shared offline radio-choice presentation, selected/submitted states and duplicate-submit protection; correctness stays with the existing caller/rules.
- `src/PdfLanding.jsx`, `src/api/profilePdf.js`: in-memory PDF selection, validation and explicit configurable upload boundary.
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

- The forest uses filler content and local, temporary prototype progress. Its optional PDF endpoint does not yet provide a mapped processing/question-generation contract. The indoor demo uses biology samples; its pasted notes are never sent. The separate developer/account Study material flow uploads a selected PDF; fake backend mode ignores its text.
- The indoor demo opens its door after one correct recall. The forest requires three correct questions for each item and all five items to open the castle.
- Offline answer checking uses explicit alternatives with normalized case and whitespace, not semantic grading. Backend tester answers are graded by the actual server.
- Forest and indoor sample progress reset on refresh. The preserved courtyard's account integration uses sessionStorage and backend persistence; the forest never resumes that account. No multiplayer or room decay.
- Desktop keyboard and mouse controls; touch navigation is not implemented. Pointer lock availability depends on the browser, with drag-to-look as a fallback.
- The forest implements the five-item bridge, two trail encounters and one dragon hall as an offline prototype. Server guest sessions, authoritative collectible progression, multiple floors and separate rescue progression remain unavailable. The preserved courtyard's backend goblin flow follows the server's own admission rules. See the forest guest handoff for the required backend changes.

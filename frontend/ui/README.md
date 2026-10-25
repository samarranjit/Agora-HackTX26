# Memory Palace

A local Vite + React + Three.js fantasy exploration prototype. The main environment is Crownwater: a royal garden courtyard surrounded by a moat, with a raised drawbridge and a towering palace. The original indoor biology recall demo is available from the start/pause menu.

## Run

```powershell
npm.cmd install
npm.cmd run dev
```

Open the local URL printed by Vite (normally http://localhost:5173). Use a desktop browser with WebGL. No environment variables, API keys, backend, or added dependencies are needed.

## Explore the courtyard

1. Open the app and click **Enter courtyard**. This deliberate click requests pointer lock. If your browser declines, drag with the left mouse button to look, or click **Lock mouse** to retry.
2. **WASD** moves relative to your view. **Space** jumps when grounded; holding/repeating it does not enable flight. **Shift + WASD** sprints while stamina remains. Walk or rest to recover; release Shift after exhaustion before sprinting again.
3. **Esc** opens pause and releases the mouse. Click **Resume exploration** to return and request pointer lock again. Switching tabs pauses the game too.
4. Explore around the fountain and gardens. Solid walls, benches, tower bases and the palace block movement. At the north edge, the gate notice explains that the drawbridge remains raised.
5. Walk off the central northern edge into the moat, or through the eastern overlook opening. Falling returns you to the starting spawn with motion cleared. This does not reset difficulty, learning progress or the indoor demo.
6. The sword is a decorative camera prop. Hearts display existing run state; there are no attacks, health penalties, collectibles, XP awards, bridge unlocking, castle floors or backend calls in this milestone.

Check at 1366 x 768 and 1280 x 600. Menus should scroll when necessary, contain keyboard focus and suppress gameplay keys. The moat remains unsupported even during a sprint-jump; the palace is not accessible yet.

## Test the indoor recall loop

Choose **Visit the indoor recall demo** from the courtyard menu. You can also open `/?demo=indoor` directly. Use the **Courtyard** button during indoor exploration to return.

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

- `src/App.jsx`: sample session state, quiz progression, overlays, completion.
- `src/RoomExperience.jsx`: shared renderer/controller lifecycle for both environments, proximity labels, HUD coordination and cleanup.
- `src/roomScene.js`: the preserved room, lighting, pedestals, hinged door, exit landing, collision rules.
- `src/courtyardScene.js`, `src/palaceArchitecture.js`, `src/scenePrimitives.js`: procedural gardens, moat, palace architecture, instanced geometry/material reuse and lighting.
- `src/courtyardLayout.js`: shared structure footprints, walkable ground, collisions and moat/out-of-bounds detection.
- `src/playerControls.js`, `src/playerMotion.js`: shared input/pointer lock; courtyard-only jumping, gravity, sprint stamina and safe respawn.
- `src/sceneResources.js`, `src/swordProp.js`: shared resource disposal and the decorative camera-mounted sword.
- `src/AdventureMenu.jsx`, `src/AdventureHud.jsx`, `src/adventure.css`: courtyard start/pause menu, objective, hearts and stamina display.
- `src/game/difficulty.js`, `src/game/runState.js`: validated difficulty defaults and isolated per-run state; adventure progression remains inactive.
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

## MVP limits

- Sample data only. Pasted notes are kept in React state in this tab and are never sent anywhere or interpreted.
- One correct answer opens the gate; visiting every exhibit is encouraged but not required. Replays cycle through all three questions.
- Answer checking uses explicit alternatives with normalized case and whitespace, not semantic grading.
- State is not saved after refresh. No AI, backend, authentication, multiplayer, or room decay.
- Desktop keyboard and mouse controls; touch navigation is not implemented. Pointer lock availability depends on the browser, with drag-to-look as a fallback.
- The courtyard is an exploration milestone. The raised bridge, dragon/XP configuration and heart display do not imply those future mechanics are implemented. The backend's reported universal 100-XP admission requirement still needs coordination for Easy (25 XP) and Medium (50 XP); this app makes no backend calls.

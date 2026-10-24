# Memory Palace

A local Vite + React + Three.js demo: study playful biology exhibits in a walkable room, recall one fact, and open the exit.

## Run

```powershell
npm.cmd install
npm.cmd run dev
```

Open the local URL printed by Vite (normally http://localhost:5173). Use a desktop browser with WebGL. No environment variables, API keys, backend, or added dependencies are needed.

## Test the complete loop

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
- `src/RoomExperience.jsx`: existing first-person movement and look controls, proximity labels, interaction, animation, resource cleanup.
- `src/roomScene.js`: the preserved room, lighting, pedestals, hinged door, exit landing, collision rules.
- `src/memoryObjects.js`: three procedural, colorful mnemonic characters.
- `src/memories.js`: sample facts, imagery metadata, questions, answer alternatives, normalization.
- `src/NotesPanel.jsx`, `src/RecallQuiz.jsx`, `src/PalaceDialog.jsx`: notes UI, recall UI, shared focus-managed modal.
- `src/App.css`: responsive controls, HUD, panels, and feedback styles.

## Validation

```powershell
npm.cmd run build
npm.cmd run lint
```

The production build may report Vite's bundle-size advisory because Three.js is included in the main bundle.

## MVP limits

- Sample data only. Pasted notes are kept in React state in this tab and are never sent anywhere or interpreted.
- One correct answer opens the gate; visiting every exhibit is encouraged but not required. Replays cycle through all three questions.
- Answer checking uses explicit alternatives with normalized case and whitespace, not semantic grading.
- State is not saved after refresh. No AI, backend, authentication, multiplayer, or room decay.
- Desktop keyboard and mouse controls; touch navigation is not implemented. Pointer lock availability depends on the browser, with drag-to-look as a fallback.

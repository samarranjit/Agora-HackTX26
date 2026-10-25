# Storywood guest adventure

The active frontend remains root `src/`, started with `npm.cmd run dev`. `frontend/ui/` is untouched. The default route now starts in an uphill forest with a visible palace, five fairy-tale collectibles, a drawbridge and one dragon hall. Existing Three.js player controls, modal focus, instanced scenery, scene cleanup and the backend client/tester are reused. No dependencies were added.

## Play

1. Choose **Begin offline guest adventure**. WASD moves, mouse/pointer lock or drag looks, Space jumps, Shift sprints, E interacts and Escape pauses. Follow the winding uphill path; lanterns and branching stepping stones lead toward the items. The journal gives landmark hints.
2. Find King Triton's Trident by the pond, Red Riding Hood's Cloak in the eastern woods, Cinderella's Glass Slipper at a stone arch, Humpty Dumpty's Eggs under a shelter, and Alice's Potion among violet mushrooms.
3. Each item has exactly three questions, shown one at a time. Their prompt is `*filler question*`, accepted typed answer is `answer`, and **Learn more** reveals `filler explanation`. Typed answers permit deliberate incorrect-answer testing without indistinguishable choice labels. Content is centralized in `src/game/forestContent.js` (15 distinct collectible questions).
4. Complete all three correctly to collect an item, award **20 prototype XP once**, and record its checkpoint. Answers before the third question award no XP. Closing or switching challenges preserves partial answers, feedback and remaining health.
5. Collect **all five items**, reaching **100 XP**, to lower the bridge and raise the portcullis. Collision remains closed until the animation is finished. Walk through the entrance to record the castle checkpoint and enter the hall.
6. Approach the procedural Storykeeper Dragon and press E. Its separate local encounter reuses three studied placeholder questions and awards no extra collectible XP. Three correct answers complete the prototype adventure. The arch behind you returns to the forest.

The clarified health rule is **one of three displayed hearts lost per incorrect answer**, equivalent to one-third of total health. Three mistakes exhaust health. A wrong answer never advances the question. The third mistake immediately replaces the entire run: new run ID, start position, three hearts, zero XP, no items/challenge history/checkpoints and a locked castle. Previous run events cannot apply to the new run. No heart recovery occurs on dialog close, pause, collection or castle entry.

Only Medium is offered internally, without a selection step. The requested five-item **20 × 5 = 100 XP** forest progression is a scoped prototype rule. Earlier Easy/Medium/Hard settings and the earlier 5-XP relic constant remain unchanged for the preserved implementation; backend rules are not modified.

## Guest lifetime and honest backend boundary

The default adventure is **explicitly offline**. Run state is held only in React memory, with no localStorage/sessionStorage save, no token, no account creation, no uploaded files and no backend requests. Reload or a new visit starts from zero. A back/forward-cache revisit also resets the run. Switching tabs merely pauses; it does not count as leaving the page. A full reset replaces local run state; there is no associated server run to reset or orphaned guest upload to delete.

Existing account sessions in browser storage are neither loaded into nor modified by this guest route. No account is created behind the scenes, and local XP is labeled **prototype XP**, never server-authoritative XP.

The existing backend requires registration/login and bearer tokens. Inspection of `origin/main` routes/schemas/authentication confirms no genuine guest-session, collectible-group or run-reset endpoint. Backend source remains absent from this checkout; no branch was merged or switched to obtain it. The default server selects Forest Goblin before Troll and Dragon and uses different health/reward rules. Therefore the hall encounter is not represented as a server dragon battle.

**Backend API Tester** remains development-only in the start/pause menu. It uses the existing real client and account endpoints, in an isolated developer session; its account UI never appears in the production guest flow. Tester mutations affect its explicit account, not the local forest run. It creates no requests merely by opening. Legacy courtyard/API integration and the indoor room remain available in development at `/?demo=courtyard` and `/?demo=indoor`.

## Smallest backend handoff still needed (proposed, not implemented)

The backend teammate must agree on these capabilities before connecting this guest adventure. No calls to the following proposed endpoints have been invented in the frontend:

- **Create temporary guest:** for example `POST /api/guest-sessions`, issuing an opaque bearer token, server-owned guest/run IDs, expiry and a Medium campaign configuration. Make creation retry-safe with one idempotency key per intended visit. Do not use the AI module's `sessionId` as authentication or create hidden permanent accounts.
- **Reset current guest run:** a guest-only operation, for example `POST /api/me/run/reset`, atomically replacing run identity, XP, health, collectible completions, checkpoints, pending attempts and gate/dragon flags. Fence stale answers by run identity; preserve safe idempotent retries. This must not reset a permanent account accidentally.
- **End/expire guest:** an explicit end operation plus mandatory server TTL cleanup. Suggested prototype policy: a 60-minute absolute guest lifetime, revoke access at expiry, then a periodic sweep at least every 15 minutes that removes guest-owned records, uploaded PDF bytes, question sets/answers and provider indexes. A page-close request is best-effort only; server expiry must work if a browser disappears. These times are proposed policy values requiring teammate agreement, not existing behavior. Ordinary account logout currently revokes a token without deleting account data.
- **Authoritative collectible challenges:** initialize exactly five stable items with three public questions each. The existing answer endpoint can be extended with stored collectible context, but the server must track accepted questions, award 20 XP once only after all three are correct, record checkpoints, and require all five plus 100 XP to unlock. Never accept client-supplied XP or a completion flag as evidence.
- **Health/reset and dragon campaign:** apply the agreed three-mistake rule and full guest reset on zero; expose the result to the frontend. Configure a guest campaign with the dragon as its actual final opponent, rather than relabeling a Forest Goblin response. Auth alone does not supply these gameplay rules: existing engine/backend policies need a scoped campaign/rule extension and tests.

Regenerate OpenAPI and update the shared client's validators/tests with that agreed contract. Keep token ownership, uploaded-file ownership and private answer keys on the server. No guest PDF upload is currently enabled, so the frontend is not claiming a cleanup policy exists already.

## Implementation and focused validation

- `src/game/forestContent.js` and `forestRun.js`: replaceable definitions and pure progression, rewards, health, stale-event guards, milestones and full resets.
- `src/forestLayout.js`: shared terrain height, placements, clear branch paths, colliders, interaction ranges and bridge corridor.
- `src/forestScene.js` and `storybookProps.js`: instanced forest/palace, dynamic entrance, collectible models and animated dragon hall.
- `src/RoomExperience.jsx`: uses those handles with the same renderer and controller lifecycle. `playerMotion.js` now follows supported slopes.
- `src/ForestJourney.jsx` and `ForestChallenge.jsx`: guest lifecycle and modal orchestration, using shared menus/HUD/dialogs. `App.jsx` chooses the default forest or development legacy demo.
- `tests/forest.test.js`: seven focused checks covering exact question totals, health/retry behavior, completion/deduplication, reset, all-five/100-XP gate and dragon progression, slope/collision behavior, animation admission and resource disposal.

Run `npm.cmd run build`, `npm.cmd run lint`, and `node --test tests/*.test.js`. The existing Three.js bundle-size advisory remains. Browser checks and final results are reported with the implementation; no live server success is implied by the local prototype or rule tests.

Actual validation for this slice: production build passed (about 858 kB JavaScript, 237 kB gzip; >500-kB advisory), lint passed without warnings, and all **43 tests** passed (36 existing + 7 forest checks). `git diff --check` passed with Windows LF/CRLF notices.

Focused headless Chrome checks used the actual scene, keyboard movement and UI with no API interception or mock server: the castle is visible from the trailhead; E opens a nearby collectible; all three filler questions and Learn more work; item completion awards 20 XP and a checkpoint; closing/reopening preserves lost health; the third mistake fully resets; reload starts fresh; all five items reach 100 XP; the bridge opens, castle entry records its checkpoint, and the dragon's three-question encounter completes without more XP. The guest route made **zero backend requests** and no JavaScript exceptions were observed. The castle check continued from the reached entrance after correcting a case-sensitive assertion in the inspection script. Screenshots and inspection scripts are under ignored `.qa.local/` (`forest-start.png`, `forest-open-bridge.png`, `forest-dragon-hall.png`, `forest-reset.png`).

`frontend/ui/` was not changed. API-client tests still pass, but live temporary server sessions, server cleanup and server dragon/collectible rules cannot be tested because those contracts are absent. No physical-device pointer-lock playthrough or performance benchmark is claimed. No commit, push, merge, reset or branch switch was performed.

## Visual and audio polish

`walkFeel.js` adds a bounded vertical camera offset based on actual grounded displacement. Physics and proximity use the original position; the visual offset is removed before every update, settles at rest and is disabled in the air, when paused or under reduced motion. Movement speeds, collisions and controls are unchanged.

The shared scene has taller tiered pedestals, slow full rotations, offset float phases, proximity glow, a bounded reusable sparkle pool, subtle motes and restrained foliage variation. Collected items stop idling and disappear after a short confirmation. `useCollectionPresentation.js` delays only the HUD's item/XP/checkpoint display by 520 ms; the existing reducer remains the only owner of rewards. Effect callbacks never award XP. Bridge collision still waits for its existing animation to finish. Question, heart, counter, castle-entry and dragon-completion feedback use short scoped transitions; reduced motion removes CSS movement and freezes decorative model motion.

`audio/storyAudio.js` synthesizes quiet footsteps, ambience, approach/interaction cues, correct/incorrect/heart feedback, collection chimes, bridge rumble and dragon/victory cues. No sound files or dependencies are downloaded. A trusted pointer or keyboard activation is required before AudioContext creation. The master mute applies to ambience and effects, in-flight voices are bounded and rate-limited, hidden pages are silent, and scene-owner unmount closes audio and disconnects nodes. `SoundControl.jsx` appears within both the world header and the dialog's focus trap. Unsupported or failed audio leaves gameplay usable.

Polish changes are scoped to `RoomExperience.jsx`, `forestScene.js`, `ForestJourney.jsx`, `ForestChallenge.jsx`, `AdventureHud.jsx`, `PalaceDialog.jsx`, `forest.css`, and the new presentation/audio helpers. Content, progression rules, the backend client, guest lifetime, and `frontend/ui/` remain unchanged. Backend limitations above still apply.

Focused browser inspection verified a nonzero real Web Audio signal after a trusted gesture, zero contexts before that gesture, mute/unmute in dialogs, restrained walking bob and settling, five spinning items with fixed XZ positions, incorrect/correct feedback, collection and the unchanged 20-XP reward, reduced-motion behavior, 1280×600 resizing, and operation with AudioContext unavailable. No JavaScript exceptions were observed. Audio was checked through its running graph; subjective timbre/volume on physical speakers and a hardware performance benchmark were not assessed. Screenshots are in ignored `.qa.local/polished-pedestal.png` and `polished-reduced-motion-menu.png`.

Polish validation: build passed (about 870 kB JavaScript / 241 kB gzip; existing >500-kB advisory), lint passed without warnings, and all **49 tests** passed. The six added polish checks cover walking presentation, audio gesture/rate/mute/disposal behavior and unavailable audio, bounded particle resources, collectible animation and one-time dragon completion effects. Existing progression, reset, bridge, controller, resource-lifecycle and API checks remain green. `git diff --check` passed with Windows LF/CRLF notices. No game data, rules or backend files were changed; the unrelated untracked `tatus --short` file was left alone.

# Memory Palace implementation plan

## Baseline and boundaries

Direct inspection at clean commit `c48139e` confirms the existing indoor sample recall loop. See `GAME_DESIGN.md` for the file-by-file inventory, difficulty table and proposed rules. Baseline `npm.cmd run build` passed with the existing large-main-bundle advisory (approximately 771.98 kB minified). Browser functionality and laptop performance were not reverified in this planning pass.

This planning change touches only `AGENTS.md`, `docs/GAME_DESIGN.md`, and `docs/IMPLEMENTATION_PLAN.md`. All module names and interfaces below are proposals for future authorized implementation; none are being created now. Preserve the current room as a regression/demo path during migration. No packages, AI calls, backend calls, asset generation or gameplay changes belong to this documentation task.

## Proposed scene and state architecture

Keep plain JavaScript and React with direct Three.js. Introduce boundaries incrementally rather than replacing `RoomExperience` in one change.

| Proposed area | Responsibility and interface |
| --- | --- |
| `src/game/difficulty.js` | Immutable Easy/Medium/Hard configuration matching the design exactly; no UI-specific thresholds. |
| `src/game/adventureReducer.js` | Pure validated state transitions and selectors; no Three.js objects, DOM, timers or network requests. |
| `src/game/sampleAdventure.js` | Stable content/relic/encounter definitions and deterministic question queues; reuse `memories.js` normalization and facts. |
| `src/game/challenges.js` | Question/turn identity and result validation shared by relic/combat modes. |
| `src/scene/sceneManager.js` | One canvas/renderer, scene selection, state projection, resource ownership and disposal. Adapt the current effect lifecycle behind this boundary. |
| `src/scene/legacyRoom.js`, `courtyard.js`, `castleFloor.js`, `summit.js` | Builders returning a common scene handle. `legacyRoom` initially delegates to `createRoomScene`; floors are generated from shared layout/config data. |
| `src/player/controls.js`, `movement.js` | Existing input/look behavior; player-relative collision, supported surface height, ramp traversal, vertical velocity and hazard checks. Camera eye Y becomes ground Y + eye height. |
| `src/scene/interactions.js` | Nearest eligible interaction/trigger by stable ID and range, with facing/occlusion checks as layouts grow. Never let E activate an enemy through walls or another floor. |
| Existing React UI + future HUD/challenge wrappers | `App` owns reducer and overlay selection; `PalaceDialog` remains modal shell; adapt `RecallQuiz` presentation for context-specific result events rather than direct door unlocking. |

Scene handle proposal: `{ root, spawnPoints, colliders, walkableSurfaces, hazards, interactables, update(dt, viewState), dispose() }`. Static scene geometry must not be rebuilt on each answer, health change or HUD render. Stable IDs connect relic/enemy meshes to data; meshes never own XP or completion state. Dispose only owned resources; shared geometry/material caches need an explicit owner. Preserve StrictMode cleanup behavior.

Use one renderer and persistent simplified castle/atrium shell. Load the courtyard or active floor's detailed colliders/entities plus the nearby stair landing; retain cheap distant gallery silhouettes so the atrium stays visible. Floors share a generator with parameters for elevation, palette, landmark, encounter and next-stair gate. Walkable ramps under stair visuals support real ascent without a physics dependency; transitions commit checkpoints on entering a landing, not arbitrary camera teleports. Rendered gates and colliders share state so closed bridges/stairs remain physically blocked.

### Authoritative client state in offline mode

Suggested reducer state:

```text
runId, mode (offline-sample / future-integrated), difficulty
stage (setup / courtyard / castle / summit / rescued)
completedRelicIds, defeatedEnemyIds, learningHistory
currentFloor, checkpoint { sceneId, spawnId, floorIndex }
playerHearts (0..3)
activeEncounter { enemyId, hearts, questionId, turnId, resolution }
pendingChallenge { kind, targetId, questionId, attemptId, resolution }
bridgeState (raised / lowering / lowered), rescued
overlay (none / notes / pause / relic / combat / recovery / victory)
```

Derive XP as `5 * completedRelicIds.length`, required targets from difficulty, and stair eligibility from defeated enemy IDs. `discovered`/inspected IDs may remain a separate teaching aid; approaching a mesh must never award XP. Keep transform/velocity, held keys, clock and animation interpolation in the renderer/player runtime rather than React state each frame. Reducer checkpoint IDs resolve to scene spawn transforms.

Events include `START_RUN`, `OPEN_CHALLENGE`, `RESOLVE_RELIC`, `START_ENCOUNTER`, `RESOLVE_COMBAT_TURN`, `NEXT_TURN`, `BRIDGE_LOWERED`, `ENTER_FLOOR`, `FALL`, `RESPAWN`, `RESCUE`, and explicit `RESET_RUN`. Validate stage, target, question and run/attempt/turn IDs before accepting results. Ignore stale or duplicate resolutions. A lowering-complete event requires an eligible pending bridge transition. Closing overlays changes UI state only; it cannot refund damage or generate a new free encounter. A hazard/recovery latch prevents repeated triggers before the player reaches safe ground.

Health reaching zero enters recovery and resets the unfinished encounter on respawn. Falls use the same checkpoint recovery without deleting XP/relics/history, defeated enemies or unlocked routes. Save learning progress separately from transient combat/camera state. New run/reset is the only intentional in-session progress wipe. Browser persistence is deferred.

## Phases and acceptance criteria

### Phase 1 — Extract reusable boundaries while preserving the current loop

This is the exact first implementation phase. Keep the indoor room as the only playable scene. Add the common scene-handle adapter, extract input/player control behavior from `RoomExperience`, and define pure difficulty configuration and adventure-state initialization/selectors. Wire the adapter to the existing room without enabling an adventure route. Keep the current notes, quiz, door, replay, sample data and completion behavior. Do not build the courtyard, award XP, introduce health/combat, enable climbing or contact a backend in this phase.

Acceptance:

- `npm.cmd run build` and `npm.cmd run lint` pass; report the bundle advisory if unchanged.
- The three objects, proximity labels, correct/incorrect door answers, actual exit crossing, replay question rotation and reset still work from a fresh page.
- WASD speed/diagonal normalization, pointer lock, drag fallback, pitch limit, pedestal/wall collision, Escape, blur and hidden-tab pause are preserved.
- Typing WASD/E in notes or answers never moves/interacts; held movement clears on opening UI. Focus and visible close/return work at 1366x768 and 1280x600.
- Ten resets/scene mount cycles leave one canvas and one input listener set; disposed scenes stop animating. Check renderer resource counts for growth after warm-up.
- Pure configuration checks assert exactly 5/5/25/3/5, 10/7/50/4/10 and 20/9/100/5/20 (relics/floors/XP/enemy/dragon), and player max hearts 3. No adventure is presented as implemented.

### Phase 2 — Courtyard collection and drawbridge slice

Create the offline courtyard scene, palace silhouette, surrounding moat/channel, raised drawbridge and five Easy relics. Add opt-in adventure setup, difficulty-driven fixtures, relic question UI, reducer rewards and objective/XP HUD. Preserve the legacy room entry. Expand to 10/20 placements for Medium/Hard before enabling those selections. Add minimal supported-surface/fall recovery now so the moat is safe, even before castle ascent.

Acceptance:

- The first-person spawn visibly establishes the courtyard, moat, royal palace and raised bridge in the documented art style. All relics can be reached without crossing the locked bridge.
- Before the final required relic, the bridge blocks traversal. Exactly 5/10/20 unique correct relic completions yield 25/50/100 XP, animate the bridge down once, and enable crossing after its animation finishes.
- Wrong/blank relic answers grant no XP; repeated interactions, duplicate submissions and stale run events cannot grant extra rewards. Difficulty changes require a new run.
- Falling before and after collection respawns on safe ground, retains completed relics/XP, and does not cause a respawn loop. Bridge eligibility survives respawn.
- Notes explicitly remain sample-only. HUD totals reflect difficulty instead of hardcoded three-item counts. No network requests occur.

### Phase 3 — Reusable castle ascent, atrium and checkpoints

Build the shared floor generator, stairs/ramp support, central atrium shell, gates and scene handoffs. Exercise traversal with clearly labeled development fixtures for gate states until combat arrives; do not expose a player-facing bypass. Configure 5/7/9 total levels with the last reserved for the summit.

Acceptance:

- Supported movement changes camera elevation through stairs; walls, railings and closed gates block correctly. Atrium openings trigger falling and recovery. No activation through walls, above/below floors or outside interaction range.
- Ascending to each floor updates floor HUD and a safe checkpoint and restores hearts to 3. Falls return there with all previously earned learning progress and defeated-floor flags intact.
- From galleries, the atrium and neighboring balcony silhouettes remain visible; floors have distinguishable landmarks despite reused structure.
- Scene changes preserve progression but clear transient keys/velocity; twenty transitions produce no duplicate canvases/listeners or steadily growing GPU resource counts.

### Phase 4 — Knowledge combat and defeat recovery

Adapt the question presenter and reducer for one enemy on each non-final floor. Use already studied facts with deterministic turns; add health indicators, explicit next-turn feedback and durable encounter identity.

Acceptance:

- Correct answers remove exactly one enemy heart; wrong answers remove exactly one player heart; blank submissions do neither. Ordinary enemies start at 3/4/5 hearts by difficulty, player at 3.
- A defeated enemy stays defeated and unlocks only its own next-floor stair. Combat grants no relic XP. Zero player hearts trigger checkpoint recovery with three hearts and full health on the unfinished enemy.
- Close/reopen preserves current question/result and health. Pause causes no attack; duplicate Enter/clicks do not resolve multiple turns. Old encounter/run responses are ignored.
- Three wrong turns cause recovery without wiping relics, XP, history or earlier victories; a later retry can still finish the floor. Test a fall during an unfinished encounter using the same preservation rules.

### Phase 5 — Dragon, rescue and complete adventure

Add the stylized summit dragon and princess, using the same combat rules. Connect full difficulty-specific routes to the summit and explicit rescue/victory interaction. Keep art additions within the scene budget.

Acceptance:

- Dragon health is exactly 5/10/20; correct answers damage it one heart at a time. Player defeat respawns at the summit checkpoint without undoing earlier progress.
- Reaching the summit or closing combat does not win. Dragon defeat enables princess interaction; that interaction enters rescued/victory exactly once.
- Full offline runs on all difficulties demonstrate the specified relic totals, XP, floor counts, enemy health, dragon health and rescue. Explicit new run resets all run progress; pause/recovery do not.

### Phase 6 — Laptop polish and integration readiness

Profile courtyard, atrium, Hard's 20-relic world and dragon. Tune shared resources, instancing, visible-detail range, lighting/shadows and sign readability. Run the 60-second laptop benchmark described in the design; preserve accessible keyboard overlays and non-color health/gate cues. Record representative hardware and measured results before claiming performance acceptance.

Acceptance:

- At 1366x768, sustain median at least 30 FPS on the recorded integrated-GPU laptop over a representative traversal; no growing resources after ten resets/transitions. If unmet, reduce detail before adding effects.
- At 1280x600, all challenge/notes/recovery controls remain reachable by keyboard, dialogs scroll, and focus does not escape to background actions. Pointer lock denial still allows completion with drag-look.
- Build and lint pass, and the legacy room plus offline adventure smoke routes pass. Visual review confirms storybook silhouettes, royal palette, warm torches and atrium depth without voxel or realistic-AAA drift.
- Backend readiness is tracked against the contract checklist below. API implementation is a separate authorized task after agreement, not an automatic part of polish.

## Backend handoff and blocking contract checklist

Owner for coordination: frontend implementer and backend teammate together; teammate identity/endpoint details are not present in this repository. Start this discussion in parallel with offline phases. It does not block the offline demonstration, but it blocks unsupported integrated admission.

| Item | Required agreement/evidence |
| --- | --- |
| Reported conflict | Current described adventure endpoint requires 100 XP; Easy reaches 25 and Medium 50. Keep these defaults unchanged in the plan and client. |
| Gate meaning | Confirm route/method, whether it creates an adventure or authorizes keep entry, and when the frontend should call it. No guessed path. |
| Difficulty and scoring | Agree server-supported difficulty IDs and 25/50/100 targets, relic requirements, authoritative XP and completion validation. Prefer server configuration per difficulty; do not trust a client-supplied XP total. |
| Request/response contract | Agree version, run/session identity, question/relic/attempt identity, progression receipts, error codes, idempotency, retries and reconnect reconciliation. |
| Failure behavior | Show denial/unsupported difficulty clearly; keep integrated entry blocked. Never auto-award XP, downgrade difficulty, skip checks, or silently turn a rejected server run into offline success. |
| Contract tests before enablement | Server admits valid Easy 25/Medium 50/Hard 100 under the agreed contract; rejects under-target, mismatched difficulty, forged or duplicate completion evidence; frontend handles denial/network errors without granting access. |

Do not enable integrated Easy/Medium while the server still requires a universal 100 XP. Hard's local 100 XP is not proof of server acceptance either. The offline mode must be labeled and intentionally selected, not used as an error fallback. Document the final teammate agreement before implementing any calls.

## Verification approach

Use dependency-free pure rule checks (Node's built-in assertions/test facilities) for configuration, reducer rewards, deduplication, damage and recovery. Verify actual renderer/UI behavior in a browser: focus, input pausing, collisions, stair elevation, gate animation versus collision state, falls and full victory cannot be established by a production build alone. Avoid tests that merely repeat mesh construction details. Run `npm.cmd run build` and `npm.cmd run lint` at each application phase, then the phase-specific acceptance route; record what was actually run and any remaining uncertainty.

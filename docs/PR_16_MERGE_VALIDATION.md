# PR #16 merge resolution

## Verified starting point

- Repository: `samarranjit/HackTX26`; PR: https://github.com/samarranjit/HackTX26/pull/16.
- GitHub API identifies the actual base as `main` at `62800b4160bf5b5ea48e6d0c34ebd798e6496dbb`, and head as `feature/forest-guest-prototype` at `80986661b1cb467255e33ec419b7e6d497f8fab8`.
- Local branch matches the PR head; local/remote divergence is `0 0`. No merge, rebase, sequencer or unmerged index entries existed.
- Existing uncommitted documentation/test changes from the mandatory-flow migration are preserved in a validated checkpoint before merging. No existing work is reset or stashed away.

## Test-count audit before merge

The actual starting working tree passes **47 tests**, lint and build. The old checked-in tests still refer to removed offline reducers/sample content and the retired persisted-account/anonymous-upload interfaces. Their deletions/replacements and pure scene/controller adaptations were already present before this task. The new `pdfAdventure.test.js` covers the mandatory authenticated flow, server scoping, grading, idempotency, expiry and cancellation. The working tree's 47-test baseline is used for this merge; no additional test is removed, skipped or excluded to make the merge pass.

## Resolution intent

`main` removed the original root prototype/build files and added the standalone `minimap/` project plus backend/engine/AI changes. The active app must remain root Vite + React + Three.js with mandatory Sign In/Create Account → automatic PDF upload → processing → forest. Root build infrastructure, controls, dialogs, forest/castle and real backend integration must survive. Incoming standalone minimap and backend changes must survive without hand-editing protected backend/engine/AI or `frontend/ui/` code. `.env.local` stays local and ignored.

Live PDF generation and gameplay remain unverified until the backend tunnel works. Earlier intercepted browser campaigns are frontend contract checks only.

## Resolved merge

- Checkpoint `020a2a1` preserves the previously uncommitted documentation and regression migration.
- All seven reported conflicts are modify/delete conflicts: `main` removed the old root prototype. Keep the newer root app, dialogs, renderer, room regression geometry and README, and retain root build/configuration/assets. There are no incoming edits to these deleted root files to splice into the authenticated flow.
- Git also inferred directory renames into `minimap/`, creating conflicts for feature-only files. Keep those modules under `src/`; remove only the synthetic relocations that do not exist on `main`. Preserve the entire actual incoming minimap tree byte-for-byte. It remains a separate project, not a second player entry point or a newly integrated root dependency.
- Staged trees for `backend/`, `Game_Engine/`, `ai_module/`, `minimap/` and `output/` match `origin/main` exactly. Active root source, dependency manifests/lockfile, controls, tests, build infrastructure and `frontend/ui/` match the checkpoint exactly. No backend code or dependencies were authored or changed during resolution.
- `.env.local` SHA-256 is unchanged and `git check-ignore` confirms the root `*.local` rule. It is not staged.

## Validation after resolution

- `node --test tests/*.test.js`: **47 passed, 0 failed, 0 skipped**, matching the audited baseline.
- `npm.cmd run lint`: passes; two existing warnings in incoming `minimap/src/PhaserGame.jsx` (exporting constants alongside a component, and reading a ref during render). The standalone minimap was retained unchanged rather than altered as part of frontend conflict resolution.
- `npm.cmd run build`: passes, 54 modules; main JS 862.45 kB / 238.46 kB gzip. Existing greater-than-500-kB advisory remains.
- No unmerged index entries or conflict markers remain. Both staged and working-tree `git diff --check` pass. Complete staged changes were audited against both parents: incoming projects match the base, while root frontend files retain the feature implementation.
- Headless Chrome contract-fixture campaign: 150 API requests, five practice questions, server-controlled 100-XP admission, three guardians, victory at 70 XP, identical-key ambiguous-answer retry, keyboard movement, modal focus and reload returning to Sign In; no browser exceptions. Separate error fixtures pass sign-in Retry, upload 503 Retry, generation-failure Retry and expired authentication returning to Sign In. These checks intercept HTTP responses and do not establish live question generation or persistence.
- A live read-only CORS preflight to the shared tunnel's `/api/study-packs` now returns HTTP 200, permits `http://127.0.0.1:5173`, and allows Authorization, Idempotency-Key and ngrok-skip-browser-warning headers. Live account/PDF generation/gameplay was not exercised in this merge task. Earlier tunnel failures remain historical evidence, not its current reachability status; a complete live run is still required.

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

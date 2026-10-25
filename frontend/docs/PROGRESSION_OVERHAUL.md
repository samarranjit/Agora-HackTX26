# Gameplay overhaul: implementation and API boundary

## Plan and inspected baseline

Work starts on `feature/forest-guest-prototype` at `dd9556e`, with a clean worktree and no unmerged entries. Read the historical game design and implementation plan, root scene/control/dialog/HUD code, API coordinator/validators, backend OpenAPI, schemas, routes, persistence and engine rules. The new request supersedes the historical offline and 5-XP proposals. No backend, engine, AI, dependency, environment, or old `frontend/ui/` changes are planned.

1. Add authenticated saved-pack listing, selection and polling using existing routes; preserve automatic PDF upload and safe retries. Keep progress ownership explicit: the current backend stores one player state per user, not per pack.
2. Keep health/XP visible during questions, show real guardian progress, add a leaderboard availability panel, and attach practice dialogs to their scenery item without claiming collection.
3. Start eligible forest encounters automatically once per approach, with current-villain validation and no duplicate requests. Preserve controls and pause/focus behavior.
4. Expand the existing 80-by-152 hall with side galleries and a separate prison wing, matching floors, colliders, lights, entrances and server-controlled prison bars. Do not invent a rescue/completion mutation.
5. Add deterministic contract/scene tests and browser checks; run the entire suite, lint, build and whitespace checks. Report every blocked rule below.

## Verified existing contract

- `GET /api/study-packs` returns `{ study_packs: StudyPackResponse[] }`, authenticated and owner-scoped; there is no pagination in v1. `GET /api/study-packs/{document_id}` polls existing jobs. `POST /api/study-packs` uploads multipart PDF and returns 202; no regeneration/retry or upload idempotency operation exists.
- Question-set reads return IDs and summaries, not full questions or teaching content. `POST /api/practice/attempts` selects the next practice question using an optional `question_set_id`; there is no item/question assignment operation. Pending attempts are account-wide and can belong to another PDF.
- `GET /api/me/state`, `/status`, `/active-attempt` restore the one account-wide player state. `player_states` is keyed by user ID. Selecting a pack scopes new questions, not progress. The frontend must not label these balances as a per-pack campaign or lifetime total.
- `POST /api/adventure/battles` accepts only optional `question_set_id`, starts the next server guardian and charges 30 XP. Default guardians are Forest Goblin, Bridge Troll, Castle Dragon, with one question each. Correct answers give 10/15/20/25/30 XP by difficulty, wrong battle answers deduct XP and health. Castle admission is an irreversible 100-XP flag, not five-item/two-monster eligibility.
- Answer mutation uses an Idempotency-Key and atomically grades/persists state. Three lives, item collections, distinct seven-question dragon assignment, campaign reset, lifetime XP, leaderboard and separate princess rescue are absent from the OpenAPI/routes/schemas/storage.

## Required backend work (proposal, not implemented endpoints)

The backend owner must agree/version the following operations and response shapes before client integration. These are semantic operation names, not invented HTTP paths used by production code.

- **Create/select/resume campaign**: input `{document_id, campaign_id?}`; return `{campaign_id, document_id, state_version, status, checkpoint, health, max_health, lives, max_lives:3, run_xp, lifetime_xp, items, monsters, dragon, princess_rescued, castle_unlocked}`. Enforce ownership and persist user/pack/campaign association. Distinguish switching packs from starting a new campaign. Include campaign summaries in saved-pack listing. Reads must never implicitly create/reset a campaign.
- **Prepare item challenge**: input `{campaign_id,item_id}`; return three stable distinct generated question IDs and public pending question/progress. Persist five item IDs, assignments, three correct-answer receipts and collection state. Advance only after a correct answer; teach from server-supplied source/concept material only in this context. Return explicit insufficient-question/regeneration state, with a retryable generation operation referencing the same pack, not a duplicate upload.
- **Start/answer encounter**: input `{campaign_id,target_id}` and later `{attempt_id,answer}` with idempotency keys; return authoritative question, progress, damage, health/lives and outcome. Two monster IDs must each pay 100 XP once; dragon must have exactly seven distinct pack question IDs, with agreed damage/win rules, paying 250 XP once on confirmed win. Item collection pays 20 XP once. Do not retain the old per-answer rewards/entry deductions for this campaign type. Total listed completed-campaign rewards are 550 XP.
- **Death/respawn/reset**: transaction consumes exactly one life at zero health and returns a unique death event/checkpoint. With remaining lives, restore health and coherent progress. At zero lives create/restart campaign state with three lives, initial health, five uncollected items, two living monsters, locked castle and undefeated dragon. Persist idempotent death/reset receipts. Never subtract or reset lifetime XP; separate campaign balances from the account ledger. Do not let geometry callbacks directly create repeated deaths.
- **Rescue princess**: input `{campaign_id}` and idempotency key; validate dragon defeated, persist rescued/completed state and return final summary `{items,monsters,dragon,run_xp,lifetime_xp,rank}`. Replaying the operation must return the same outcome. Allow explicit new campaign or return to library after completion.
- **Leaderboard read**: authenticated (or agreed public) shared query `{cursor?,limit?}`; return `{entries:[{rank,display_name,lifetime_xp}],next_cursor,self:{rank,lifetime_xp}}`. Compute stable tie semantics/ranks server-side over a persistent cross-user lifetime ledger. No fabricated entries or browser-calculated global ranking.
- Reward ledger must uniquely constrain `(campaign_id,event_type,target_id)` inside the same transaction as authoritative completion and lifetime balance updates; enforce optimistic state versions and idempotent retries. Campaign and lifetime state must survive reload, death, new campaigns and PDF switching.

## Deliberate limits

Until those operations exist, the frontend can resume saved questions and account-wide progress, show the existing authoritative combat rules, and explore the expanded castle when the existing server flag admits entry. It cannot honestly implement the requested item rewards, three lives, five-item/two-monster gate, seven-question dragon, separate rescue victory, campaign restarts or global leaderboard. No substitute state, reward math, sample data, assumed route or local-storage ledger is used in production.

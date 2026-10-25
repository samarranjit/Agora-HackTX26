# Mandatory authenticated journey

Git checked before editing: branch `feature/forest-guest-prototype`, no merge/rebase/sequencer and no unmerged paths. Prior simplification changes are present and are being adapted in place, not discarded or reset.

1. Reuse the existing real authentication/serialized gameplay coordinator, retaining only page-memory credentials and retries. Sign In is always first; successful registration/login advances directly to upload.
2. Reuse automatic study-pack upload/polling, bind real authenticated player state and PDF-scoped questions, then enter the preserved forest automatically. All grading, health, XP, guardian order and unlocks remain server-owned.
3. No alternate routes, sample data, API tester, account menu or offline fallback. Test strict screen ordering, errors/retries, scoping, idempotency and renderer controls; run lint/build and available browser checks. Keep prior state/configuration and protected sources intact.

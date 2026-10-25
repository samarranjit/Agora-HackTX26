> Historical account-free experiment. The latest mandatory Sign In → PDF → Play requirement supersedes this record. See [LINEAR_FLOW_VALIDATION.md](LINEAR_FLOW_VALIDATION.md) and [BACKEND_MODE.md](BACKEND_MODE.md) for current behavior.

# Account-free frontend simplification

Inspected the current root frontend and fetched `origin/main` at `62800b4160bf5b5ea48e6d0c34ebd798e6496dbb` on 2026-10-25. Its frontend contract, OpenAPI security, dependencies and study-pack/gameplay routes require an account bearer token. There is no anonymous run API. The configured ngrok URL currently returns HTTP 404 `ERR_NGROK_3200` (tunnel offline).

1. Replace all account/demo routing with the single PDF opening. Selection automatically validates and submits, shows bounded processing, errors and manual Retry. Remove player diagnostics, account code and storage recovery.
2. Preserve the world builders and controls, remove sample questions and local grading/reward rules. Only a genuine backend adventure may enable exploration. Keep missing anonymous adventure admission explicitly blocked; never create identities or invent routes.
3. Test actual UI and the in-memory orchestration, including injected success at the unbound adapter seam, and real transport failures. Run lint/build/tests and browser checks. Document what the backend owner must implement and distinguish test fixtures from live success.

The existing study-pack upload can be attempted without credentials and will be rejected by the current backend. A ready study pack alone does not authorize gameplay: production adventure admission remains unbound until a temporary anonymous game-state contract exists.

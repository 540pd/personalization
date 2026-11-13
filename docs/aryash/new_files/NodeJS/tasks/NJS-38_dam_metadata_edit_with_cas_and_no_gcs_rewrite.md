# NJS-38 — DAM metadata edit with CAS and no GCS rewrite

> **Claude Code — atomic implementation prompt.** The team reports `NJS-01..08` and `PY-01..04` are already done; **do not recreate them**. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/05_SCHEMA_REVIEW.md` and `../../Environment/VARIABLE_MATRIX.md`, along with real repository `CLAUDE.md`, routes, models and tests. Implement only this task; preserve existing code conventions. No production deploy, destructive migrations, auto-commit or git push.

**Status:** NEW — one-image, no-agent MVP.  **Dependencies:** NJS-37.

## Goal and exact stores

Touch only: `dam_assets` (Firestore), `dam_asset_classification` (Firestore), `dam_asset_state` (Firestore).

## Instructions to implement

- [ ] Allow safe name/description/classification metadata edits via one owner-scoped endpoint.
- [ ] Increment metadataRevision when changing mutable metadata; never rewrite immutable storage locator or bytes.
- [ ] Validate remove/clear semantics so omitted fields are not accidentally erased.

## Tests / proof of completion

- [ ] Stale revision returns conflict.
- [ ] GCS object generation remains unchanged.

## Acceptance and boundaries

- Keep exact v8 entity/field names; do not add a new table/collection merely to make this task easier.
- Reject cross-user access by server-derived `userKey`; `brandId` and future roles do not authorize reads/writes in this phase.
- Do not implement ADK, MCP, agent tools, DAG execution, multi-image or RBAC enforcement. If behavior requires a future component, use a narrow interface/mocked dependency and document it.
- Report: changed files, behavior, exact schema touched, tests run (with output), and remaining blockers. Never claim tests passed without running them.

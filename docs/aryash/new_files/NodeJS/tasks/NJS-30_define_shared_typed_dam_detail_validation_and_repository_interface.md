# NJS-30 — Define shared typed DAM detail validation and repository interface

> **Claude Code — atomic implementation prompt.** The team reports `NJS-01..08` and `PY-01..04` are already done; **do not recreate them**. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/05_SCHEMA_REVIEW.md` and `../../Environment/VARIABLE_MATRIX.md`, along with real repository `CLAUDE.md`, routes, models and tests. Implement only this task; preserve existing code conventions. No production deploy, destructive migrations, auto-commit or git push.

**Status:** NEW — one-image, no-agent MVP.  **Dependencies:** NJS-25.

## Goal and exact stores

Touch only: `dam_assets` (Firestore).

## Instructions to implement

- [ ] Define one typed repository interface keyed by assetId and canonical dam_assets.kind, without creating a new Firestore collection.
- [ ] Implement shared validation that forbids attaching a typed record to a different asset kind.
- [ ] Document one-to-one kind dispatch; leave each collection implementation to NJS-55..60.

## Tests / proof of completion

- [ ] Kind mismatch rejected by shared validator.
- [ ] No generic details collection is created.

## Acceptance and boundaries

- Keep exact v8 entity/field names; do not add a new table/collection merely to make this task easier.
- Reject cross-user access by server-derived `userKey`; `brandId` and future roles do not authorize reads/writes in this phase.
- Do not implement ADK, MCP, agent tools, DAG execution, multi-image or RBAC enforcement. If behavior requires a future component, use a narrow interface/mocked dependency and document it.
- Report: changed files, behavior, exact schema touched, tests run (with output), and remaining blockers. Never claim tests passed without running them.

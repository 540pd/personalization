# NJS-41 — Authorized input-image binary proxy

> **Claude Code — atomic implementation prompt.** The team reports `NJS-01..08` and `PY-01..04` are already done; **do not recreate them**. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/05_SCHEMA_REVIEW.md` and `../../Environment/VARIABLE_MATRIX.md`, along with real repository `CLAUDE.md`, routes, models and tests. Implement only this task; preserve existing code conventions. No production deploy, destructive migrations, auto-commit or git push.

**Status:** NEW — one-image, no-agent MVP.  **Dependencies:** NJS-26,36.

## Goal and exact stores

Touch only: `dam_asset_files` (Firestore), `dam_assets` (Firestore).

## Instructions to implement

- [ ] Stream GCS input image by verified bucket/object/generation after session and userKey checks.
- [ ] Set Content-Type from verified metadata, safe cache headers, correct 404/410 behavior and abort handling.
- [ ] Never expose signed bucket-wide paths or trust a raw object path from query params.

## Tests / proof of completion

- [ ] Cross-user read returns 404/403 without bytes.
- [ ] Exact generation is requested from GCS.

## Acceptance and boundaries

- Keep exact v8 entity/field names; do not add a new table/collection merely to make this task easier.
- Reject cross-user access by server-derived `userKey`; `brandId` and future roles do not authorize reads/writes in this phase.
- Do not implement ADK, MCP, agent tools, DAG execution, multi-image or RBAC enforcement. If behavior requires a future component, use a narrow interface/mocked dependency and document it.
- Report: changed files, behavior, exact schema touched, tests run (with output), and remaining blockers. Never claim tests passed without running them.

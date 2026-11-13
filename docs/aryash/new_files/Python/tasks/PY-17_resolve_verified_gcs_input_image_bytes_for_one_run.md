# PY-17 — Resolve verified GCS input image bytes for one Run

> **Claude Code — atomic implementation prompt.** The team reports `NJS-01..08` and `PY-01..04` are already done; **do not recreate them**. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/05_SCHEMA_REVIEW.md` and `../../Environment/VARIABLE_MATRIX.md`, along with real repository `CLAUDE.md`, routes, models and tests. Implement only this task; preserve existing code conventions. No production deploy, destructive migrations, auto-commit or git push.

**Status:** NEW — one-image, no-agent MVP.  **Dependencies:** PY-10,16.

## Goal and exact stores

Touch only: `gcs_input` (GCS), `dam_asset_files` (Firestore).

## Instructions to implement

- [ ] Read authorized inputAssetHandles from immutable manifest; validate one-bucket object generation.
- [ ] Download/stream only bounded main and reference images with MIME/size checks.
- [ ] Use Python SDK directly for MVP; future artifact MCP remains out of scope.

## Tests / proof of completion

- [ ] Raw unapproved GCS URI cannot be read.
- [ ] Missing generation returns classified failure.

## Acceptance and boundaries

- Keep exact v8 entity/field names; do not add a new table/collection merely to make this task easier.
- Reject cross-user access by server-derived `userKey`; `brandId` and future roles do not authorize reads/writes in this phase.
- Do not implement ADK, MCP, agent tools, DAG execution, multi-image or RBAC enforcement. If behavior requires a future component, use a narrow interface/mocked dependency and document it.
- Report: changed files, behavior, exact schema touched, tests run (with output), and remaining blockers. Never claim tests passed without running them.

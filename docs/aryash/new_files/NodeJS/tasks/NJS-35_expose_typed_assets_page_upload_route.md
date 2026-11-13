# NJS-35 — Expose typed Assets-page upload route

> **Claude Code — atomic implementation prompt.** The team reports `NJS-01..08` and `PY-01..04` are already done; **do not recreate them**. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/05_SCHEMA_REVIEW.md` and `../../Environment/VARIABLE_MATRIX.md`, along with real repository `CLAUDE.md`, routes, models and tests. Implement only this task; preserve existing code conventions. No production deploy, destructive migrations, auto-commit or git push.

**Status:** NEW — one-image, no-agent MVP.  **Dependencies:** NJS-33,55..60.

## Goal and exact stores

Touch only: `dam_assets` (Firestore), `dam_product_images` (Firestore), `dam_logos` (Firestore), `dam_guidelines` (Firestore).

## Instructions to implement

- [ ] Allow `POST /assets?kind=...` or existing equivalent for six typed categories.
- [ ] Validate per-kind details and create the matching Firestore detail record; set uploadOrigin=assets_page.
- [ ] Reusing a canvas asset on Assets page must link existing ID and avoid second GCS upload.

## Tests / proof of completion

- [ ] Each typed kind generates correct detail record.
- [ ] Add-existing flow does not duplicate stored bytes.

## Acceptance and boundaries

- Keep exact v8 entity/field names; do not add a new table/collection merely to make this task easier.
- Reject cross-user access by server-derived `userKey`; `brandId` and future roles do not authorize reads/writes in this phase.
- Do not implement ADK, MCP, agent tools, DAG execution, multi-image or RBAC enforcement. If behavior requires a future component, use a narrow interface/mocked dependency and document it.
- Report: changed files, behavior, exact schema touched, tests run (with output), and remaining blockers. Never claim tests passed without running them.

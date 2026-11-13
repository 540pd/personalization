# NJS-09 — Inventory completed BFF code and identify Cloud SQL migration seams

> **Claude Code — atomic implementation prompt.** The team reports `NJS-01..08` and `PY-01..04` are already done; **do not recreate them**. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/05_SCHEMA_REVIEW.md` and `../../Environment/VARIABLE_MATRIX.md`, along with real repository `CLAUDE.md`, routes, models and tests. Implement only this task; preserve existing code conventions. No production deploy, destructive migrations, auto-commit or git push.

**Status:** NEW — one-image ADK MVP.  **Dependencies:** NJS-01..08 completed.

## Goal and exact stores

Touch only: `users` (Cloud SQL), `identity_links` (Cloud SQL), `login_sessions` (Cloud SQL), `idempotency_keys` (Cloud SQL), `board_runtime` (Cloud SQL), `job_admissions` (Cloud SQL).

## Instructions to implement

- [ ] Inspect real routes/services/tests for NJS-01..08; map current persistence interfaces and document exact call sites, without changing their functional behavior.
- [ ] List operations currently using Firestore/local fallbacks that need Cloud SQL; produce migration checklist and adapter boundaries.
- [ ] Flag opaque-cookie vs JWT mismatch if present; do not silently rewrite authentication.

## Tests / proof of completion

- [ ] A written interface map links every existing function to a target SQL table.
- [ ] No changes to existing authentication or admission semantics.

## Acceptance and boundaries

- Keep exact v8 entity/field names; do not add a new table/collection merely to make this task easier.
- Reject cross-user access by server-derived `userKey`; `brandId` and future roles do not authorize reads/writes in this phase.
- ADK/Agent Runtime plus restricted MCP artifact/event tools ARE in scope. Do not implement DAG/topological scheduling, autonomous agent-led DAM search/selection, multi-image generation, RBAC enforcement, or Cloud Scheduler/Reconciler. Integrate through the defined runtime interfaces; do not move image generation into Node/FastAPI.
- Report: changed files, behavior, exact schema touched, tests run (with output), and remaining blockers. Never claim tests passed without running them.

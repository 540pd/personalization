# INF-26 — Verify all 16 Cloud SQL migrations, keys and concurrency indexes

> **Claude Code — atomic implementation prompt.** The team reports `NJS-01..08` and `PY-01..04` are already done; **do not recreate them**. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/05_SCHEMA_REVIEW.md` and `../../Environment/VARIABLE_MATRIX.md`, along with real repository `CLAUDE.md`, routes, models and tests. Implement only this task; preserve existing code conventions. Never apply GCP production changes, IAM bindings or migrations without explicit approval; no auto-commit or git push.

**Status:** NEW — one-image ADK MVP.  **Dependencies:** INF-19..25.

## Goal and exact stores

Touch only: `users` (Cloud SQL), `identity_links` (Cloud SQL), `login_sessions` (Cloud SQL), `brands` (Cloud SQL), `brand_memberships` (Cloud SQL), `role_policies` (Cloud SQL), `brand_settings` (Cloud SQL), `campaign_briefs` (Cloud SQL), `boards` (Cloud SQL), `board_content` (Cloud SQL), `board_runtime` (Cloud SQL), `skill_registry_links` (Cloud SQL), `skill_grants` (Cloud SQL), `idempotency_keys` (Cloud SQL), `job_admissions` (Cloud SQL), `audit_events` (Cloud SQL).

## Instructions to implement

- [ ] Run all migrations on staging then check 16 exact business table names, columns and FK/index existence.
- [ ] Test transactional CAS for board_content, board_runtime lock, job_admissions attempt fence and idempotency collision.
- [ ] Document any v8 legacy aliases not represented as duplicate physical columns and get owner review before production.

## Tests / proof of completion

- [ ] Schema drift report has all 16 tables.
- [ ] Concurrent lock/claim tests prove correct serialization.

## Acceptance and boundaries

- Keep exact v8 entity/field names; do not add a new table/collection merely to make this task easier.
- Reject cross-user access by server-derived `userKey`; `brandId` and future roles do not authorize reads/writes in this phase.
- ADK/Agent Runtime plus restricted MCP artifact/event tools ARE in scope. Do not implement DAG/topological scheduling, autonomous agent-led DAM search/selection, multi-image generation, RBAC enforcement, or Cloud Scheduler/Reconciler. Integrate through the defined runtime interfaces; do not move image generation into Node/FastAPI.
- Report: changed files, behavior, exact schema touched, tests run (with output), and remaining blockers. Never claim tests passed without running them.

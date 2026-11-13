# INF-18 — Staging smoke tests, schema drift checks and rollback plan

> **Claude Code — atomic implementation prompt.** The team reports `NJS-01..08` and `PY-01..04` are already done; **do not recreate them**. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/05_SCHEMA_REVIEW.md` and `../../Environment/VARIABLE_MATRIX.md`, along with real repository `CLAUDE.md`, routes, models and tests. Implement only this task; preserve existing code conventions. Never apply GCP production changes, IAM bindings or migrations without explicit approval; no auto-commit or git push.

**Status:** NEW — one-image ADK MVP.  **Dependencies:** INF-05..17,19..26; NJS-54; PY-28, ADK-25, INF-32.

## Goal and exact stores

Touch only: `job_admissions` (Cloud SQL), `dam_assets` (Firestore), `slot_events` (BigQuery).

## Instructions to implement

- [ ] Run one uploaded image → Node admission → Python worker → GCS output → BQ slot_ready → Node stream → Firestore feedback.
- [ ] Verify Cloud SQL 16 tables, Firestore 17 collection names, BQ 3 physical+2 views, single GCS bucket and permissions.
- [ ] Document rollback for schema migration and deployment, pending decisions, and manual resolution after exhausted task retries.

## Tests / proof of completion

- [ ] One complete smoke run with fake/mock image and no agents.
- [ ] No unauthorized read, stale fence or duplicate output accepted.

## Acceptance and boundaries

- Keep exact v8 entity/field names; do not add a new table/collection merely to make this task easier.
- Reject cross-user access by server-derived `userKey`; `brandId` and future roles do not authorize reads/writes in this phase.
- ADK/Agent Runtime plus restricted MCP artifact/event tools ARE in scope. Do not implement DAG/topological scheduling, autonomous agent-led DAM search/selection, multi-image generation, RBAC enforcement, or Cloud Scheduler/Reconciler. Integrate through the defined runtime interfaces; do not move image generation into Node/FastAPI.
- Report: changed files, behavior, exact schema touched, tests run (with output), and remaining blockers. Never claim tests passed without running them.

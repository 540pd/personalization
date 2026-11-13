# INF-19 — Migrate identity SQL tables: users, identity_links, login_sessions

> **Claude Code — atomic implementation prompt.** The team reports `NJS-01..08` and `PY-01..04` are already done; **do not recreate them**. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/05_SCHEMA_REVIEW.md` and `../../Environment/VARIABLE_MATRIX.md`, along with real repository `CLAUDE.md`, routes, models and tests. Implement only this task; preserve existing code conventions. Never apply GCP production changes, IAM bindings or migrations without explicit approval; no auto-commit or git push.

**Status:** NEW — one-image ADK MVP.  **Dependencies:** INF-05.

## Goal and exact stores

Touch only: `users` (Cloud SQL), `identity_links` (Cloud SQL), `login_sessions` (Cloud SQL).

## Instructions to implement

- [ ] Create exact canonical columns, PKs and identity/session uniqueness/FKs for three tables from v8 dictionary.
- [ ] Retain revocation/expiry behavior and document legacy ttl_at field as SQL cleanup timestamp, not Firestore TTL.

## Tests / proof of completion

- [ ] All three tables migrate successfully twice.
- [ ] Duplicate identity hashes and session hashes cannot be inserted.

## Acceptance and boundaries

- Keep exact v8 entity/field names; do not add a new table/collection merely to make this task easier.
- Reject cross-user access by server-derived `userKey`; `brandId` and future roles do not authorize reads/writes in this phase.
- ADK/Agent Runtime plus restricted MCP artifact/event tools ARE in scope. Do not implement DAG/topological scheduling, autonomous agent-led DAM search/selection, multi-image generation, RBAC enforcement, or Cloud Scheduler/Reconciler. Integrate through the defined runtime interfaces; do not move image generation into Node/FastAPI.
- Report: changed files, behavior, exact schema touched, tests run (with output), and remaining blockers. Never claim tests passed without running them.

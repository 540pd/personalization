# NJS-14 — Move Playspace concurrency lock into board_runtime SQL transaction

> **Claude Code — atomic implementation prompt.** The team reports `NJS-01..08` and `PY-01..04` are already done; **do not recreate them**. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/05_SCHEMA_REVIEW.md` and `../../Environment/VARIABLE_MATRIX.md`, along with real repository `CLAUDE.md`, routes, models and tests. Implement only this task; preserve existing code conventions. No production deploy, destructive migrations, auto-commit or git push.

**Status:** NEW — one-image ADK MVP.  **Dependencies:** NJS-10; NJS-06 done.

## Goal and exact stores

Touch only: `board_runtime` (Cloud SQL), `job_admissions` (Cloud SQL).

## Instructions to implement

- [ ] Use `board_runtime` row locking/CAS to reserve `lock_owner_job_id`,`lock_fence`,`lock_expires_at` for the admitted job.
- [ ] Preserve session-related ADK fields as null/untouched; no ADK session creation in this task.
- [ ] Release only via authorized terminal transition, not simply because worker lease expires.

## Tests / proof of completion

- [ ] Two different Run keys on one board cannot both reserve an active job.
- [ ] Non-owner cannot release another job lock.

## Acceptance and boundaries

- Keep exact v8 entity/field names; do not add a new table/collection merely to make this task easier.
- Reject cross-user access by server-derived `userKey`; `brandId` and future roles do not authorize reads/writes in this phase.
- ADK/Agent Runtime plus restricted MCP artifact/event tools ARE in scope. Do not implement DAG/topological scheduling, autonomous agent-led DAM search/selection, multi-image generation, RBAC enforcement, or Cloud Scheduler/Reconciler. Integrate through the defined runtime interfaces; do not move image generation into Node/FastAPI.
- Report: changed files, behavior, exact schema touched, tests run (with output), and remaining blockers. Never claim tests passed without running them.

# NJS-46 — Complete SQL job_admissions reservation lifecycle

> **Claude Code — atomic implementation prompt.** The team reports `NJS-01..08` and `PY-01..04` are already done; **do not recreate them**. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/05_SCHEMA_REVIEW.md` and `../../Environment/VARIABLE_MATRIX.md`, along with real repository `CLAUDE.md`, routes, models and tests. Implement only this task; preserve existing code conventions. No production deploy, destructive migrations, auto-commit or git push.

**Status:** NEW — one-image ADK MVP.  **Dependencies:** NJS-13,14,45.

## Goal and exact stores

Touch only: `job_admissions` (Cloud SQL), `idempotency_keys` (Cloud SQL), `board_runtime` (Cloud SQL).

## Instructions to implement

- [ ] Reserve logical job_id, request_hash, board lock, idempotency key and deadline in SQL transaction.
- [ ] After manifest write, update manifest locator and dispatch_state; keep explicit reserved/enqueued/running/terminal transitions.
- [ ] Expose a consistent pending job if FastAPI dispatch acknowledgement is uncertain.

## Tests / proof of completion

- [ ] Concurrent admission never creates two active jobs on same board.
- [ ] Interrupted dispatch retains same job_id for safe retry.

## Acceptance and boundaries

- Keep exact v8 entity/field names; do not add a new table/collection merely to make this task easier.
- Reject cross-user access by server-derived `userKey`; `brandId` and future roles do not authorize reads/writes in this phase.
- ADK/Agent Runtime plus restricted MCP artifact/event tools ARE in scope. Do not implement DAG/topological scheduling, autonomous agent-led DAM search/selection, multi-image generation, RBAC enforcement, or Cloud Scheduler/Reconciler. Integrate through the defined runtime interfaces; do not move image generation into Node/FastAPI.
- Report: changed files, behavior, exact schema touched, tests run (with output), and remaining blockers. Never claim tests passed without running them.

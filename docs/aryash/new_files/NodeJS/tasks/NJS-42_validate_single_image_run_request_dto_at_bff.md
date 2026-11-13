# NJS-42 — Validate single-image Run request DTO at BFF

> **Claude Code — atomic implementation prompt.** The team reports `NJS-01..08` and `PY-01..04` are already done; **do not recreate them**. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/05_SCHEMA_REVIEW.md` and `../../Environment/VARIABLE_MATRIX.md`, along with real repository `CLAUDE.md`, routes, models and tests. Implement only this task; preserve existing code conventions. No production deploy, destructive migrations, auto-commit or git push.

**Status:** NEW — one-image ADK MVP.  **Dependencies:** NJS-15,18.

## Goal and exact stores

Touch only: `boards` (Cloud SQL), `job_admissions` (Cloud SQL).

## Instructions to implement

- [ ] Accept one selected image-generation node and exactly one output slot for this phase; normalize prompt, refs and optional brief ID.
- [ ] Do not parse DAG/topological order; board edges may still be saved as UI state.
- [ ] Bind userKey from session and capture nodeId, boardId, prompt and idempotency key.

## Tests / proof of completion

- [ ] One image request succeeds validation.
- [ ] Count>1 or graph-only run returns explicit unsupported scope error.

## Acceptance and boundaries

- Keep exact v8 entity/field names; do not add a new table/collection merely to make this task easier.
- Reject cross-user access by server-derived `userKey`; `brandId` and future roles do not authorize reads/writes in this phase.
- ADK/Agent Runtime plus restricted MCP artifact/event tools ARE in scope. Do not implement DAG/topological scheduling, autonomous agent-led DAM search/selection, multi-image generation, RBAC enforcement, or Cloud Scheduler/Reconciler. Integrate through the defined runtime interfaces; do not move image generation into Node/FastAPI.
- Report: changed files, behavior, exact schema touched, tests run (with output), and remaining blockers. Never claim tests passed without running them.

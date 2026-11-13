# PY-15 — Claim SQL worker lease with monotonic attempt fencing

> **Claude Code — one atomic task.** NJS-01..08 and PY-01..04 are completed; inspect and reuse. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/06_COMPONENT_BOUNDARIES.md`, `../../Shared/05_SCHEMA_REVIEW.md` and the actual repo `CLAUDE.md`. Never auto-deploy, apply migrations, push, or expose secrets.

**Status:** NEW — single-image ADK MVP.  **Depends on:** PY-09,14; INF-24.

**Exact approved schema references:** `job_admissions, board_runtime`. Do not invent tables or rename collections.

## Implement only this
- [ ] Use Cloud SQL row lock/transaction on `job_admissions` to claim attempt_no and lease_fence atomically.
- [ ] Return already-terminal idempotent success without rerunning ADK; active unexpired lease cannot be stolen.
- [ ] Persist fence that ADK and MCP writer validate; no remote GCP requests inside SQL transaction.

## Acceptance / tests
- [ ] Concurrent attempts yield one winner, stale lease cannot advance canonical state.

## Boundaries
- **FastAPI calls ADK, not Vertex image generation. ADK owns model invocation and image artifacts.** No multi-node DAG, autonomous DAM search, multi-image, or RBAC enforcement.
- Preserve `userKey` authorization, nullable `brandId` context only, attempt/fence rules, and exact v8 schemas.
- Report changed files, verified commands/tests, schema affected, remaining blockers and next dependencies.

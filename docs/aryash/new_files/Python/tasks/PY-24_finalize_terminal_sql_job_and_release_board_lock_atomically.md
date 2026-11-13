# PY-24 — Finalize terminal SQL job and release board lock atomically

> **Claude Code — one atomic task.** NJS-01..08 and PY-01..04 are completed; inspect and reuse. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/06_COMPONENT_BOUNDARIES.md`, `../../Shared/05_SCHEMA_REVIEW.md` and the actual repo `CLAUDE.md`. Never auto-deploy, apply migrations, push, or expose secrets.

**Status:** NEW — single-image ADK MVP.  **Depends on:** PY-15,16,22,23.

**Exact approved schema references:** `job_admissions, board_runtime`. Do not invent tables or rename collections.

## Implement only this
- [ ] Use SQL transaction to finalize accepted attempt, set dispatch_state terminal and release matching board lock.
- [ ] Reject stale fence; provide idempotent terminal replay handling; do not call BQ/GCS/ADK within SQL transaction.
- [ ] Only return HTTP 2xx to Cloud Tasks after terminal commit.

## Acceptance / tests
- [ ] Concurrent finalizers cannot unlock unrelated jobs or overwrite newer attempt.

## Boundaries
- **FastAPI calls ADK, not Vertex image generation. ADK owns model invocation and image artifacts.** No multi-node DAG, autonomous DAM search, multi-image, or RBAC enforcement.
- Preserve `userKey` authorization, nullable `brandId` context only, attempt/fence rules, and exact v8 schemas.
- Report changed files, verified commands/tests, schema affected, remaining blockers and next dependencies.

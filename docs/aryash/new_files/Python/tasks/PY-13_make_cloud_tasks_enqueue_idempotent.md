# PY-13 — Make Cloud Tasks enqueue idempotent

> **Claude Code — one atomic task.** NJS-01..08 and PY-01..04 are completed; inspect and reuse. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/06_COMPONENT_BOUNDARIES.md`, `../../Shared/05_SCHEMA_REVIEW.md` and the actual repo `CLAUDE.md`. Never auto-deploy, apply migrations, push, or expose secrets.

**Status:** NEW — single-image ADK MVP.  **Depends on:** PY-12.

**Exact approved schema references:** `job_admissions`. Do not invent tables or rename collections.

## Implement only this
- [ ] Reuse stable task name for one job; ALREADY_EXISTS means possible original enqueue, verify SQL dispatch state.
- [ ] Prevent transient enqueue failures from creating new job IDs or duplicate ADK runs.
- [ ] Maintain explicit state for reserved/enqueued; no Cloud Scheduler cleanup.

## Acceptance / tests
- [ ] Repeated dispatch calls do not create duplicate task names.

## Boundaries
- **FastAPI calls ADK, not Vertex image generation. ADK owns model invocation and image artifacts.** No multi-node DAG, autonomous DAM search, multi-image, or RBAC enforcement.
- Preserve `userKey` authorization, nullable `brandId` context only, attempt/fence rules, and exact v8 schemas.
- Report changed files, verified commands/tests, schema affected, remaining blockers and next dependencies.

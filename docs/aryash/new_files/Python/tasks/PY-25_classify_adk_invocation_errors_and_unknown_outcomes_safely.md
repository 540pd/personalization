# PY-25 — Classify ADK invocation errors and unknown outcomes safely

> **Claude Code — one atomic task.** NJS-01..08 and PY-01..04 are completed; inspect and reuse. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/06_COMPONENT_BOUNDARIES.md`, `../../Shared/05_SCHEMA_REVIEW.md` and the actual repo `CLAUDE.md`. Never auto-deploy, apply migrations, push, or expose secrets.

**Status:** NEW — single-image ADK MVP.  **Depends on:** PY-19,22,24; ADK-22.

**Exact approved schema references:** `job_admissions, job_events`. Do not invent tables or rename collections.

## Implement only this
- [ ] Distinguish pre-invocation retryable transport errors from ambiguous remote ADK/Vertex outcome.
- [ ] Never automatically re-invoke model after uncertain remote result; persist recoverable diagnostic state with existing schema.
- [ ] Cloud Tasks may retry unacknowledged delivery but app must prevent costly ambiguous double-generation; expose manual/explicit user resolution path; no scheduler.

## Acceptance / tests
- [ ] Retries of failed writer do not invoke ADK again; unknown remote execution tested.

## Boundaries
- **FastAPI calls ADK, not Vertex image generation. ADK owns model invocation and image artifacts.** No multi-node DAG, autonomous DAM search, multi-image, or RBAC enforcement.
- Preserve `userKey` authorization, nullable `brandId` context only, attempt/fence rules, and exact v8 schemas.
- Report changed files, verified commands/tests, schema affected, remaining blockers and next dependencies.

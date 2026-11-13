# PY-05 — Attach single-image dispatcher router to completed FastAPI service

> **Claude Code — one atomic task.** NJS-01..08 and PY-01..04 are completed; inspect and reuse. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/06_COMPONENT_BOUNDARIES.md`, `../../Shared/05_SCHEMA_REVIEW.md` and the actual repo `CLAUDE.md`. Never auto-deploy, apply migrations, push, or expose secrets.

**Status:** NEW — single-image ADK MVP.  **Depends on:** PY-01..04 complete; INF-04.

**Exact approved schema references:** `job_admissions`. Do not invent tables or rename collections.

## Implement only this
- [ ] Reuse completed PY-01..04 Skills/service scaffolding without rebuilding it; add isolated dispatcher/worker routers.
- [ ] Create dependency-injected interfaces for Cloud SQL job repository, Cloud Tasks, ADK runner client and event writer.
- [ ] Ensure no route calls Vertex image generation; register health/readiness without leaking secrets.

## Acceptance / tests
- [ ] Existing Skills tests pass unchanged; new router can be imported with mock dependencies.

## Boundaries
- **FastAPI calls ADK, not Vertex image generation. ADK owns model invocation and image artifacts.** No multi-node DAG, autonomous DAM search, multi-image, or RBAC enforcement.
- Preserve `userKey` authorization, nullable `brandId` context only, attempt/fence rules, and exact v8 schemas.
- Report changed files, verified commands/tests, schema affected, remaining blockers and next dependencies.

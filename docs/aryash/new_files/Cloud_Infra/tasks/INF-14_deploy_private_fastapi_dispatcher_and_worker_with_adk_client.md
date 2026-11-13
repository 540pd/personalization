# INF-14 — Deploy private FastAPI dispatcher and worker with ADK client

> **Claude Code — one atomic task.** NJS-01..08 and PY-01..04 are completed; inspect and reuse. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/06_COMPONENT_BOUNDARIES.md`, `../../Shared/05_SCHEMA_REVIEW.md` and the actual repo `CLAUDE.md`. Never auto-deploy, apply migrations, push, or expose secrets.

**Status:** NEW — single-image ADK MVP.  **Depends on:** INF-03,04,08,09,12,26.

**Exact approved schema references:** `job_admissions`. Do not invent tables or rename collections.

## Implement only this
- [ ] Deploy Cloud Run FastAPI API/worker endpoints privately. Attach Cloud SQL + Cloud Tasks permissions and Agent Runtime invoke role only.
- [ ] Do not grant FastAPI image model permission for newly added execution path; ADK Agent Runtime owns Vertex image capability.
- [ ] Worker timeout and task deadline must fit configured ADK end-to-end duration.

## Acceptance / tests
- [ ] Invoke worker from Cloud Tasks OIDC identity; FastAPI mock calls ADK once.

## Boundaries
- **FastAPI calls ADK, not Vertex image generation. ADK owns model invocation and image artifacts.** No multi-node DAG, autonomous DAM search, multi-image, or RBAC enforcement.
- Preserve `userKey` authorization, nullable `brandId` context only, attempt/fence rules, and exact v8 schemas.
- Report changed files, verified commands/tests, schema affected, remaining blockers and next dependencies.

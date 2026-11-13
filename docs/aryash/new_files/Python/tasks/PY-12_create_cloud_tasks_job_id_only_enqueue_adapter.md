# PY-12 — Create Cloud Tasks job-ID-only enqueue adapter

> **Claude Code — one atomic task.** NJS-01..08 and PY-01..04 are completed; inspect and reuse. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/06_COMPONENT_BOUNDARIES.md`, `../../Shared/05_SCHEMA_REVIEW.md` and the actual repo `CLAUDE.md`. Never auto-deploy, apply migrations, push, or expose secrets.

**Status:** NEW — single-image ADK MVP.  **Depends on:** PY-09,10; INF-11.

**Exact approved schema references:** `job_admissions`. Do not invent tables or rename collections.

## Implement only this
- [ ] Enqueue `{job_id}` with deterministic Cloud Tasks name and a configured Cloud Run worker URL.
- [ ] Attach task OIDC service identity and audience; no browser/user token is copied.
- [ ] Validate configured dispatch deadline and Task retry options within ADK worker execution limit.

## Acceptance / tests
- [ ] Task payload has job_id only; duplicate-name handling checked.

## Boundaries
- **FastAPI calls ADK, not Vertex image generation. ADK owns model invocation and image artifacts.** No multi-node DAG, autonomous DAM search, multi-image, or RBAC enforcement.
- Preserve `userKey` authorization, nullable `brandId` context only, attempt/fence rules, and exact v8 schemas.
- Report changed files, verified commands/tests, schema affected, remaining blockers and next dependencies.

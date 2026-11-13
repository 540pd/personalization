# PY-08 — Define dispatcher and ADK handoff schemas for one image

> **Claude Code — one atomic task.** NJS-01..08 and PY-01..04 are completed; inspect and reuse. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/06_COMPONENT_BOUNDARIES.md`, `../../Shared/05_SCHEMA_REVIEW.md` and the actual repo `CLAUDE.md`. Never auto-deploy, apply migrations, push, or expose secrets.

**Status:** NEW — single-image ADK MVP.  **Depends on:** PY-07; NJS-42,44; ADK-03.

**Exact approved schema references:** `job_admissions, gcs_manifest`. Do not invent tables or rename collections.

## Implement only this
- [ ] Create typed dispatch request / accepted job response for exactly one node+slot.
- [ ] Define ADK invocation context: job_id, userKey, boardId, manifest bucket/object/generation, attempt_no, lease_fence, session binding and approved handle/tool allowlist.
- [ ] Define versioned ADK result receipt: status, output locator+generation, event_id, usage summary, error; reject unexpected fields and count !=1.

## Acceptance / tests
- [ ] Shared contract fixtures compile in FastAPI and ADK tests.

## Boundaries
- **FastAPI calls ADK, not Vertex image generation. ADK owns model invocation and image artifacts.** No multi-node DAG, autonomous DAM search, multi-image, or RBAC enforcement.
- Preserve `userKey` authorization, nullable `brandId` context only, attempt/fence rules, and exact v8 schemas.
- Report changed files, verified commands/tests, schema affected, remaining blockers and next dependencies.

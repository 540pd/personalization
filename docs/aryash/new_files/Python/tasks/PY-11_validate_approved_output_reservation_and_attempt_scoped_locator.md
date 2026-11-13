# PY-11 — Validate approved output reservation and attempt-scoped locator

> **Claude Code — one atomic task.** NJS-01..08 and PY-01..04 are completed; inspect and reuse. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/06_COMPONENT_BOUNDARIES.md`, `../../Shared/05_SCHEMA_REVIEW.md` and the actual repo `CLAUDE.md`. Never auto-deploy, apply migrations, push, or expose secrets.

**Status:** NEW — single-image ADK MVP.  **Depends on:** PY-10.

**Exact approved schema references:** `gcs_output, gcs_manifest`. Do not invent tables or rename collections.

## Implement only this
- [ ] Validate Node-reserved output template against `output/users/{userKey}/runs/{jobId}/attempts/{attemptNo}/nodes/{nodeId}/slots/0.ext`.
- [ ] Generate only a scoped write claim/receipt expectation for ADK/MCP; FastAPI does NOT write image bytes.
- [ ] Reject arbitrary bucket names or different job/attempt paths.

## Acceptance / tests
- [ ] Path traversal and cross-user overwrite are rejected.

## Boundaries
- **FastAPI calls ADK, not Vertex image generation. ADK owns model invocation and image artifacts.** No multi-node DAG, autonomous DAM search, multi-image, or RBAC enforcement.
- Preserve `userKey` authorization, nullable `brandId` context only, attempt/fence rules, and exact v8 schemas.
- Report changed files, verified commands/tests, schema affected, remaining blockers and next dependencies.

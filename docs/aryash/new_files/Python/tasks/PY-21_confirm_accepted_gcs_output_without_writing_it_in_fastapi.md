# PY-21 — Confirm accepted GCS output without writing it in FastAPI

> **Claude Code — one atomic task.** NJS-01..08 and PY-01..04 are completed; inspect and reuse. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/06_COMPONENT_BOUNDARIES.md`, `../../Shared/05_SCHEMA_REVIEW.md` and the actual repo `CLAUDE.md`. Never auto-deploy, apply migrations, push, or expose secrets.

**Status:** NEW — single-image ADK MVP.  **Depends on:** PY-11,20; ADK-16,17.

**Exact approved schema references:** `gcs_output, gcs_object_properties`. Do not invent tables or rename collections.

## Implement only this
- [ ] Confirm successful object receipt is within canonical output prefix and belongs to current accepted attempt.
- [ ] Do not write generated image bytes or call GCS save from worker; ADK via Artifact MCP performs create-only output.
- [ ] Expose validated slot locator to downstream status and terminalization logic only.

## Acceptance / tests
- [ ] Test catches unauthorized output location and duplicate bytes.

## Boundaries
- **FastAPI calls ADK, not Vertex image generation. ADK owns model invocation and image artifacts.** No multi-node DAG, autonomous DAM search, multi-image, or RBAC enforcement.
- Preserve `userKey` authorization, nullable `brandId` context only, attempt/fence rules, and exact v8 schemas.
- Report changed files, verified commands/tests, schema affected, remaining blockers and next dependencies.

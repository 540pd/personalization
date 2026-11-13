# PY-17 — Create verified input asset handle package for ADK

> **Claude Code — one atomic task.** NJS-01..08 and PY-01..04 are completed; inspect and reuse. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/06_COMPONENT_BOUNDARIES.md`, `../../Shared/05_SCHEMA_REVIEW.md` and the actual repo `CLAUDE.md`. Never auto-deploy, apply migrations, push, or expose secrets.

**Status:** NEW — single-image ADK MVP.  **Depends on:** PY-10,16; NJS-43.

**Exact approved schema references:** `gcs_input, dam_asset_files`. Do not invent tables or rename collections.

## Implement only this
- [ ] Validate explicit user-selected asset IDs in manifest against stored GCS locator and userKey.
- [ ] Create **opaque run-scoped handles** and assign role main_image/reference; do not download/decode bytes in FastAPI.
- [ ] Pass allowlisted handles to ADK; no autonomous Firestore DAM query.

## Acceptance / tests
- [ ] ADK handoff contains no open arbitrary GCS path and no private user credentials.

## Boundaries
- **FastAPI calls ADK, not Vertex image generation. ADK owns model invocation and image artifacts.** No multi-node DAG, autonomous DAM search, multi-image, or RBAC enforcement.
- Preserve `userKey` authorization, nullable `brandId` context only, attempt/fence rules, and exact v8 schemas.
- Report changed files, verified commands/tests, schema affected, remaining blockers and next dependencies.

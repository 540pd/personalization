# INF-30 — Grant ADK-only immutable Skill Registry revision access

> **Claude Code — one atomic task.** NJS-01..08 and PY-01..04 are completed; inspect and reuse. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/06_COMPONENT_BOUNDARIES.md`, `../../Shared/05_SCHEMA_REVIEW.md` and the actual repo `CLAUDE.md`. Never auto-deploy, apply migrations, push, or expose secrets.

**Status:** NEW — single-image ADK MVP.  **Depends on:** INF-03,27.

**Exact approved schema references:** `skill_registry_links`. Do not invent tables or rename collections.

## Implement only this
- [ ] Authorize ADK identity for read of pinned Agent Registry Skill revisions; do not grant Registry write except existing Skills service account.
- [ ] Ensure FastAPI existing PY-01..04 authoring roles are preserved, published SKILL.md not duplicated in SQL or GCS.
- [ ] Validate role/permission names against deployed Google Cloud Agent Registry APIs.

## Acceptance / tests
- [ ] Read pinned approved revision succeeds, arbitrary write denied.

## Boundaries
- **FastAPI calls ADK, not Vertex image generation. ADK owns model invocation and image artifacts.** No multi-node DAG, autonomous DAM search, multi-image, or RBAC enforcement.
- Preserve `userKey` authorization, nullable `brandId` context only, attempt/fence rules, and exact v8 schemas.
- Report changed files, verified commands/tests, schema affected, remaining blockers and next dependencies.

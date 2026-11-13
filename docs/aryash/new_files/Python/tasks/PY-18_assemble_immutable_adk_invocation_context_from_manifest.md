# PY-18 — Assemble immutable ADK invocation context from manifest

> **Claude Code — one atomic task.** NJS-01..08 and PY-01..04 are completed; inspect and reuse. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/06_COMPONENT_BOUNDARIES.md`, `../../Shared/05_SCHEMA_REVIEW.md` and the actual repo `CLAUDE.md`. Never auto-deploy, apply migrations, push, or expose secrets.

**Status:** NEW — single-image ADK MVP.  **Depends on:** PY-10,17; ADK-03.

**Exact approved schema references:** `gcs_manifest, skill_registry_links`. Do not invent tables or rename collections.

## Implement only this
- [ ] Pass promptSnapshot, campaign/persona snapshot, pinned Skill revision refs, approved input handles and output slot reservation to typed ADK contract.
- [ ] Do NOT generate enhanced prompt, derive image tags, retrieve Skill content, or call Gemini in FastAPI: those belong to ADK.
- [ ] Enforce one node and one output; preserve prompt hash/correlation and privacy.

## Acceptance / tests
- [ ] FastAPI invocation context fixture matches ADK-03 contract exactly.

## Boundaries
- **FastAPI calls ADK, not Vertex image generation. ADK owns model invocation and image artifacts.** No multi-node DAG, autonomous DAM search, multi-image, or RBAC enforcement.
- Preserve `userKey` authorization, nullable `brandId` context only, attempt/fence rules, and exact v8 schemas.
- Report changed files, verified commands/tests, schema affected, remaining blockers and next dependencies.

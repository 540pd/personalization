# INF-28 — Provision and deploy private Google ADK Agent Runtime

> **Claude Code — one atomic task.** NJS-01..08 and PY-01..04 are completed; inspect and reuse. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/06_COMPONENT_BOUNDARIES.md`, `../../Shared/05_SCHEMA_REVIEW.md` and the actual repo `CLAUDE.md`. Never auto-deploy, apply migrations, push, or expose secrets.

**Status:** NEW — single-image ADK MVP.  **Depends on:** INF-02,03,27; ADK-01,02,23.

**Exact approved schema references:** `board_runtime`. Do not invent tables or rename collections.

## Implement only this
- [ ] Deploy versioned Google ADK single-image agent into managed Agent Runtime/Engine, not as direct Python FastAPI image code.
- [ ] Configure agent runtime service identity, managed session service, network access to MCP, logging and bounded execution.
- [ ] Set FastAPI ADK runtime resource ID in Secret Manager/Cloud Run config; no unauthenticated public Agent Runtime endpoint.

## Acceptance / tests
- [ ] Mock/hello agent remote invocation passes; private invocation only.

## Boundaries
- **FastAPI calls ADK, not Vertex image generation. ADK owns model invocation and image artifacts.** No multi-node DAG, autonomous DAM search, multi-image, or RBAC enforcement.
- Preserve `userKey` authorization, nullable `brandId` context only, attempt/fence rules, and exact v8 schemas.
- Report changed files, verified commands/tests, schema affected, remaining blockers and next dependencies.

# INF-31 — Grant Vertex image-model access only to ADK runtime

> **Claude Code — one atomic task.** NJS-01..08 and PY-01..04 are completed; inspect and reuse. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/06_COMPONENT_BOUNDARIES.md`, `../../Shared/05_SCHEMA_REVIEW.md` and the actual repo `CLAUDE.md`. Never auto-deploy, apply migrations, push, or expose secrets.

**Status:** NEW — single-image ADK MVP.  **Depends on:** INF-03,27.

**Exact approved schema references:** `job_analytics`. Do not invent tables or rename collections.

## Implement only this
- [ ] Grant least privilege for Gemini planner and Vertex image models to deployed ADK identity.
- [ ] Remove proposed new FastAPI direct-generation permissions and ensure Node never receives inference IAM for new route.
- [ ] Configure quotas, max model calls and budget alerts; verify model location/access.

## Acceptance / tests
- [ ] IAM verification demonstrates ADK model access and denied image inference for Node/FastAPI new route.

## Boundaries
- **FastAPI calls ADK, not Vertex image generation. ADK owns model invocation and image artifacts.** No multi-node DAG, autonomous DAM search, multi-image, or RBAC enforcement.
- Preserve `userKey` authorization, nullable `brandId` context only, attempt/fence rules, and exact v8 schemas.
- Report changed files, verified commands/tests, schema affected, remaining blockers and next dependencies.

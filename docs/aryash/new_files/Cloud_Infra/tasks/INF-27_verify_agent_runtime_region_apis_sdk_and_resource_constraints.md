# INF-27 — Verify Agent Runtime region APIs SDK and resource constraints

> **Claude Code — one atomic task.** NJS-01..08 and PY-01..04 are completed; inspect and reuse. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/06_COMPONENT_BOUNDARIES.md`, `../../Shared/05_SCHEMA_REVIEW.md` and the actual repo `CLAUDE.md`. Never auto-deploy, apply migrations, push, or expose secrets.

**Status:** NEW — single-image ADK MVP.  **Depends on:** INF-01,02.

**Exact approved schema references:** `board_runtime, skill_registry_links`. Do not invent tables or rename collections.

## Implement only this
- [ ] Check supported Agent Runtime/Agent Engine region, ADK package and SDK/API version, agent identity prerequisites and managed session service.
- [ ] Confirm Google-only Vertex image models and Registry revision lookup are available under selected project/region.
- [ ] Confirm Agent Runtime deployment staging artifacts will respect single application asset bucket requirement; flag any separate staging bucket needed for approval.

## Acceptance / tests
- [ ] Record exact resource names, version pins and access blocker matrix.

## Boundaries
- **FastAPI calls ADK, not Vertex image generation. ADK owns model invocation and image artifacts.** No multi-node DAG, autonomous DAM search, multi-image, or RBAC enforcement.
- Preserve `userKey` authorization, nullable `brandId` context only, attempt/fence rules, and exact v8 schemas.
- Report changed files, verified commands/tests, schema affected, remaining blockers and next dependencies.

# INF-32 — Configure ADK MCP FastAPI integration and full tracing

> **Claude Code — one atomic task.** NJS-01..08 and PY-01..04 are completed; inspect and reuse. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/06_COMPONENT_BOUNDARIES.md`, `../../Shared/05_SCHEMA_REVIEW.md` and the actual repo `CLAUDE.md`. Never auto-deploy, apply migrations, push, or expose secrets.

**Status:** NEW — single-image ADK MVP.  **Depends on:** INF-14,17,28,29,30,31; ADK-09,16,18,20.

**Exact approved schema references:** `job_events, slot_events, job_analytics`. Do not invent tables or rename collections.

## Implement only this
- [ ] Connect deployed FastAPI ADK client URL/identity, MCP endpoint and Agent Runtime session resources with audience-aware tokens.
- [ ] Configure redacted ADK spans/event traces with job_id and attempt/fence, no image bytes or full user prompt.
- [ ] Run gated test of one-image mock output readiness end-to-end.

## Acceptance / tests
- [ ] Correlated trace spans reach observability; one GCS object and accepted BQ slot event.

## Boundaries
- **FastAPI calls ADK, not Vertex image generation. ADK owns model invocation and image artifacts.** No multi-node DAG, autonomous DAM search, multi-image, or RBAC enforcement.
- Preserve `userKey` authorization, nullable `brandId` context only, attempt/fence rules, and exact v8 schemas.
- Report changed files, verified commands/tests, schema affected, remaining blockers and next dependencies.

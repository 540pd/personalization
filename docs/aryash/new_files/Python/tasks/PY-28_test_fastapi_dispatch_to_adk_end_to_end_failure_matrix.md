# PY-28 — Test FastAPI dispatch to ADK end-to-end failure matrix

> **Claude Code — one atomic task.** NJS-01..08 and PY-01..04 are completed; inspect and reuse. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/06_COMPONENT_BOUNDARIES.md`, `../../Shared/05_SCHEMA_REVIEW.md` and the actual repo `CLAUDE.md`. Never auto-deploy, apply migrations, push, or expose secrets.

**Status:** NEW — single-image ADK MVP.  **Depends on:** PY-05..27; ADK-24; INF-28,32.

**Exact approved schema references:** `job_admissions, slot_events, job_events`. Do not invent tables or rename collections.

## Implement only this
- [ ] Test Node→FastAPI→Cloud Tasks→FastAPI worker→ADK mock→MCP→GCS/BQ→SQL terminal, one output.
- [ ] Include OIDC mismatch, duplicate tasks, stale lease, ADK timeout ambiguous, GCS object exists no event, BQ stale event, GCS path mismatch.
- [ ] Assert no direct Python image-generation call, no DAG, no autonomous DAM selection.

## Acceptance / tests
- [ ] Mock integration green with exact one ADK and one Vertex call; real integration gated.

## Boundaries
- **FastAPI calls ADK, not Vertex image generation. ADK owns model invocation and image artifacts.** No multi-node DAG, autonomous DAM search, multi-image, or RBAC enforcement.
- Preserve `userKey` authorization, nullable `brandId` context only, attempt/fence rules, and exact v8 schemas.
- Report changed files, verified commands/tests, schema affected, remaining blockers and next dependencies.

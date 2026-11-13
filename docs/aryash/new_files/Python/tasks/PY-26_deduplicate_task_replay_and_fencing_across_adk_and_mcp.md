# PY-26 — Deduplicate task replay and fencing across ADK and MCP

> **Claude Code — one atomic task.** NJS-01..08 and PY-01..04 are completed; inspect and reuse. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/06_COMPONENT_BOUNDARIES.md`, `../../Shared/05_SCHEMA_REVIEW.md` and the actual repo `CLAUDE.md`. Never auto-deploy, apply migrations, push, or expose secrets.

**Status:** NEW — single-image ADK MVP.  **Depends on:** PY-13,15,22,23; ADK-18,22.

**Exact approved schema references:** `job_events, slot_events, job_admissions`. Do not invent tables or rename collections.

## Implement only this
- [ ] Preserve stable task_id, attempt_no, lease_fence and event_id across retries.
- [ ] Enforce canonical state via SQL and accepted BQ view; never assume BigQuery enforces event uniqueness.
- [ ] Ensure stale result from previous ADK attempt cannot become current slot output.

## Acceptance / tests
- [ ] Simulated duplicate task and stale ADK callback have no second canonical output.

## Boundaries
- **FastAPI calls ADK, not Vertex image generation. ADK owns model invocation and image artifacts.** No multi-node DAG, autonomous DAM search, multi-image, or RBAC enforcement.
- Preserve `userKey` authorization, nullable `brandId` context only, attempt/fence rules, and exact v8 schemas.
- Report changed files, verified commands/tests, schema affected, remaining blockers and next dependencies.

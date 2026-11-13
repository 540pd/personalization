# PY-27 — Consume ADK usage and trace receipts for job_analytics

> **Claude Code — one atomic task.** NJS-01..08 and PY-01..04 are completed; inspect and reuse. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/06_COMPONENT_BOUNDARIES.md`, `../../Shared/05_SCHEMA_REVIEW.md` and the actual repo `CLAUDE.md`. Never auto-deploy, apply migrations, push, or expose secrets.

**Status:** NEW — single-image ADK MVP.  **Depends on:** PY-19,22; ADK-21.

**Exact approved schema references:** `job_analytics`. Do not invent tables or rename collections.

## Implement only this
- [ ] Consume model usage/timing from ADK event receipts, not from a FastAPI model SDK.
- [ ] Publish bounded, redacted usage through approved event writer with stable IDs and no duplicate billing counters.
- [ ] Keep optional token usage null when unavailable rather than invent values.

## Acceptance / tests
- [ ] One successful run produces one set of effective analytics events.

## Boundaries
- **FastAPI calls ADK, not Vertex image generation. ADK owns model invocation and image artifacts.** No multi-node DAG, autonomous DAM search, multi-image, or RBAC enforcement.
- Preserve `userKey` authorization, nullable `brandId` context only, attempt/fence rules, and exact v8 schemas.
- Report changed files, verified commands/tests, schema affected, remaining blockers and next dependencies.

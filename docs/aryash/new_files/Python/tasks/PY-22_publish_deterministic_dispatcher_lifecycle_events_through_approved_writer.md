# PY-22 — Publish deterministic dispatcher lifecycle events through approved writer

> **Claude Code — one atomic task.** NJS-01..08 and PY-01..04 are completed; inspect and reuse. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/06_COMPONENT_BOUNDARIES.md`, `../../Shared/05_SCHEMA_REVIEW.md` and the actual repo `CLAUDE.md`. Never auto-deploy, apply migrations, push, or expose secrets.

**Status:** NEW — single-image ADK MVP.  **Depends on:** PY-15,16; INF-09, ADK-18.

**Exact approved schema references:** `job_events`. Do not invent tables or rename collections.

## Implement only this
- [ ] Use shared restricted events writer interface for dispatcher-level QUEUED/CLAIMED/worker_failed events. ADK deterministic event plugin emits its own plan/generation events.
- [ ] Attach stable event_id, job_id, user_key, attempt_no, lease_fence, correlation, redacted metadata.
- [ ] Never allow LLM discretion over mandatory event logging or direct ad-hoc BigQuery SQL.

## Acceptance / tests
- [ ] Repeated send with same event_id cannot produce another effective status transition.

## Boundaries
- **FastAPI calls ADK, not Vertex image generation. ADK owns model invocation and image artifacts.** No multi-node DAG, autonomous DAM search, multi-image, or RBAC enforcement.
- Preserve `userKey` authorization, nullable `brandId` context only, attempt/fence rules, and exact v8 schemas.
- Report changed files, verified commands/tests, schema affected, remaining blockers and next dependencies.

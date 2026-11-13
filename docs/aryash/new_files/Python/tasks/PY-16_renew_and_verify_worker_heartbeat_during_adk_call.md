# PY-16 — Renew and verify worker heartbeat during ADK call

> **Claude Code — one atomic task.** NJS-01..08 and PY-01..04 are completed; inspect and reuse. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/06_COMPONENT_BOUNDARIES.md`, `../../Shared/05_SCHEMA_REVIEW.md` and the actual repo `CLAUDE.md`. Never auto-deploy, apply migrations, push, or expose secrets.

**Status:** NEW — single-image ADK MVP.  **Depends on:** PY-15.

**Exact approved schema references:** `job_admissions`. Do not invent tables or rename collections.

## Implement only this
- [ ] Heartbeat lease on bounded interval while remote ADK invocation is active.
- [ ] Abort acceptance/finalization on lost fence; optionally request remote cancellation when safe.
- [ ] Do not ACK HTTP 2xx before durable terminal state, and stop heartbeat promptly.

## Acceptance / tests
- [ ] Tests cover lease expiry, worker cancellation, heartbeat failure.

## Boundaries
- **FastAPI calls ADK, not Vertex image generation. ADK owns model invocation and image artifacts.** No multi-node DAG, autonomous DAM search, multi-image, or RBAC enforcement.
- Preserve `userKey` authorization, nullable `brandId` context only, attempt/fence rules, and exact v8 schemas.
- Report changed files, verified commands/tests, schema affected, remaining blockers and next dependencies.

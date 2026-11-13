# PY-23 — Verify ADK-emitted fenced slot_ready event exists

> **Claude Code — one atomic task.** NJS-01..08 and PY-01..04 are completed; inspect and reuse. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/06_COMPONENT_BOUNDARIES.md`, `../../Shared/05_SCHEMA_REVIEW.md` and the actual repo `CLAUDE.md`. Never auto-deploy, apply migrations, push, or expose secrets.

**Status:** NEW — single-image ADK MVP.  **Depends on:** PY-20,21,22; ADK-20.

**Exact approved schema references:** `slot_events`. Do not invent tables or rename collections.

## Implement only this
- [ ] After ADK returns verified receipt, check bounded BQ view/status (or approved event-writer acknowledgment), accepted attempt/fence and exact GCS generation.
- [ ] FastAPI must NOT generate a duplicate `slot_ready` event or hallucinate tags; ADK/MCP owns accepted output event.
- [ ] Classify BQ consistency delay separately from missing/failed event and avoid repeat image invocation.

## Acceptance / tests
- [ ] No receipt on missing event; tests cover duplicate BQ rows and stale worker events.

## Boundaries
- **FastAPI calls ADK, not Vertex image generation. ADK owns model invocation and image artifacts.** No multi-node DAG, autonomous DAM search, multi-image, or RBAC enforcement.
- Preserve `userKey` authorization, nullable `brandId` context only, attempt/fence rules, and exact v8 schemas.
- Report changed files, verified commands/tests, schema affected, remaining blockers and next dependencies.

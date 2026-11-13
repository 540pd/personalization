# PY-20 — Validate ADK one-image completion receipt

> **Claude Code — one atomic task.** NJS-01..08 and PY-01..04 are completed; inspect and reuse. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/06_COMPONENT_BOUNDARIES.md`, `../../Shared/05_SCHEMA_REVIEW.md` and the actual repo `CLAUDE.md`. Never auto-deploy, apply migrations, push, or expose secrets.

**Status:** NEW — single-image ADK MVP.  **Depends on:** PY-19; ADK-17,20.

**Exact approved schema references:** `slot_events`. Do not invent tables or rename collections.

## Implement only this
- [ ] Validate ADK result only: one slot, signed/authorized run, output object and generation, stable event_id, attempt fence.
- [ ] Do NOT validate image pixels/bytes in FastAPI; ADK validates through its artifact tool before publishing receipt.
- [ ] Do not accept success unless verified canonical slot_ready exists for active accepted attempt.

## Acceptance / tests
- [ ] Wrong attempt, missing GCS generation, extra slots and forged receipt rejected.

## Boundaries
- **FastAPI calls ADK, not Vertex image generation. ADK owns model invocation and image artifacts.** No multi-node DAG, autonomous DAM search, multi-image, or RBAC enforcement.
- Preserve `userKey` authorization, nullable `brandId` context only, attempt/fence rules, and exact v8 schemas.
- Report changed files, verified commands/tests, schema affected, remaining blockers and next dependencies.

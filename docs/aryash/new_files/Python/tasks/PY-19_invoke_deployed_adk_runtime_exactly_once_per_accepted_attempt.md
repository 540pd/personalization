# PY-19 — Invoke deployed ADK runtime exactly once per accepted attempt

> **Claude Code — one atomic task.** NJS-01..08 and PY-01..04 are completed; inspect and reuse. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/06_COMPONENT_BOUNDARIES.md`, `../../Shared/05_SCHEMA_REVIEW.md` and the actual repo `CLAUDE.md`. Never auto-deploy, apply migrations, push, or expose secrets.

**Status:** NEW — single-image ADK MVP.  **Depends on:** PY-16,18; ADK-03,23; INF-28.

**Exact approved schema references:** `job_admissions`. Do not invent tables or rename collections.

## Implement only this
- [ ] Implement authenticated Agent Runtime / Agent Engine client invocation with pinned deployed agent resource.
- [ ] Pass session and scoped manifest context; consume typed ADK result; do not call Vertex image models directly or create a second agent execution after uncertain timeout.
- [ ] Implement deterministic mock runtime client for tests; bounded wait and explicit timeout classification.

## Acceptance / tests
- [ ] Mock shows one ADK request; monkeypatch fails test if FastAPI calls genai image client.

## Boundaries
- **FastAPI calls ADK, not Vertex image generation. ADK owns model invocation and image artifacts.** No multi-node DAG, autonomous DAM search, multi-image, or RBAC enforcement.
- Preserve `userKey` authorization, nullable `brandId` context only, attempt/fence rules, and exact v8 schemas.
- Report changed files, verified commands/tests, schema affected, remaining blockers and next dependencies.

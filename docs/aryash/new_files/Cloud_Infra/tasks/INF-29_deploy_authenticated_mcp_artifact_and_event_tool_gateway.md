# INF-29 — Deploy authenticated MCP artifact and event tool gateway

> **Claude Code — one atomic task.** NJS-01..08 and PY-01..04 are completed; inspect and reuse. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/06_COMPONENT_BOUNDARIES.md`, `../../Shared/05_SCHEMA_REVIEW.md` and the actual repo `CLAUDE.md`. Never auto-deploy, apply migrations, push, or expose secrets.

**Status:** NEW — single-image ADK MVP.  **Depends on:** INF-02,03,07,08,09,26,27.

**Exact approved schema references:** `gcs_input, gcs_output, job_events, slot_events, job_analytics`. Do not invent tables or rename collections.

## Implement only this
- [ ] Provision private MCP gateway/service framework with explicit tool contract for `artifact.fetch_input`, `artifact.write_output`, `events.write` only; functionality is implemented by ADK-09,16,18 then deployed/tested at INF-32.
- [ ] Grant narrow GCS and BigQuery writer permissions to gateway identity; ADK should not have broad direct GCS/Firestore/BQ permissions.
- [ ] Bind signed tool claims to SQL job_id/userKey/attempt/fence, configure service-to-service OIDC, logging and disable DAM search tool.

## Acceptance / tests
- [ ] Private service denies unauthorized identity, exposes only allowlisted tool contracts and passes health/skeleton tests. Full functional tests run after ADK-09,16,18 and INF-32.

## Boundaries
- **FastAPI calls ADK, not Vertex image generation. ADK owns model invocation and image artifacts.** No multi-node DAG, autonomous DAM search, multi-image, or RBAC enforcement.
- Preserve `userKey` authorization, nullable `brandId` context only, attempt/fence rules, and exact v8 schemas.
- Report changed files, verified commands/tests, schema affected, remaining blockers and next dependencies.

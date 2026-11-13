# PY-06 — Define typed FastAPI, Cloud Tasks and ADK client configuration

> **Claude Code — one atomic task.** NJS-01..08 and PY-01..04 are completed; inspect and reuse. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/06_COMPONENT_BOUNDARIES.md`, `../../Shared/05_SCHEMA_REVIEW.md` and the actual repo `CLAUDE.md`. Never auto-deploy, apply migrations, push, or expose secrets.

**Status:** NEW — single-image ADK MVP.  **Depends on:** PY-05; Environment templates.

**Exact approved schema references:** `job_admissions`. Do not invent tables or rename collections.

## Implement only this
- [ ] Implement strict env loader for Cloud SQL, queue, GCS manifest locator, BQ project, Agent Runtime resource ID, MCP endpoint, worker OIDC issuer/audience, deadlines.
- [ ] Keep Python/ADK/MCP environment namespaces separate. Never include model key, service token or static credential in env examples.
- [ ] Deployed configuration fails fast for missing ADK resource or invalid task identity.

## Acceptance / tests
- [ ] Configuration tests cover local mock, staging and invalid production env.

## Boundaries
- **FastAPI calls ADK, not Vertex image generation. ADK owns model invocation and image artifacts.** No multi-node DAG, autonomous DAM search, multi-image, or RBAC enforcement.
- Preserve `userKey` authorization, nullable `brandId` context only, attempt/fence rules, and exact v8 schemas.
- Report changed files, verified commands/tests, schema affected, remaining blockers and next dependencies.

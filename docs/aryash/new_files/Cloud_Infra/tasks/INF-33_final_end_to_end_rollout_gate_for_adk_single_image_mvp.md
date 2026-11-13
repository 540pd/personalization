# INF-33 — Final end-to-end rollout gate for ADK single-image MVP

> **Claude Code — one atomic task.** NJS-01..08 and PY-01..04 are completed; inspect and reuse. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/06_COMPONENT_BOUNDARIES.md`, `../../Shared/05_SCHEMA_REVIEW.md` and the actual repo `CLAUDE.md`. Never auto-deploy, apply migrations, push, or expose secrets.

**Status:** NEW — single-image ADK MVP.  **Depends on:** INF-18,27..32; PY-28; ADK-25.

**Exact approved schema references:** `job_admissions, slot_events`. Do not invent tables or rename collections.

## Implement only this
- [ ] Validate no FastAPI direct Vertex image import/execution and no omitted ADK runtime IAM/model access.
- [ ] Verify schema drift vs exact v8 fields, no DAG, no agent-led DAM search, no RBAC enforcement, no Cloud Scheduler/Reconciler.
- [ ] Publish monitored staging checklist, rollback and cost evidence; any production deploy requires approval.

## Acceptance / tests
- [ ] One-image test matrix and rollback reviewed with owners.

## Boundaries
- **FastAPI calls ADK, not Vertex image generation. ADK owns model invocation and image artifacts.** No multi-node DAG, autonomous DAM search, multi-image, or RBAC enforcement.
- Preserve `userKey` authorization, nullable `brandId` context only, attempt/fence rules, and exact v8 schemas.
- Report changed files, verified commands/tests, schema affected, remaining blockers and next dependencies.

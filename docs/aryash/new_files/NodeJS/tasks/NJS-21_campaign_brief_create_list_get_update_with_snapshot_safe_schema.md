# NJS-21 — Campaign brief create/list/get/update with snapshot-safe schema

> **Claude Code — atomic implementation prompt.** The team reports `NJS-01..08` and `PY-01..04` are already done; **do not recreate them**. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/05_SCHEMA_REVIEW.md` and `../../Environment/VARIABLE_MATRIX.md`, along with real repository `CLAUDE.md`, routes, models and tests. Implement only this task; preserve existing code conventions. No production deploy, destructive migrations, auto-commit or git push.

**Status:** NEW — one-image ADK MVP.  **Dependencies:** NJS-10,15.

## Goal and exact stores

Touch only: `campaign_briefs` (Cloud SQL).

## Instructions to implement

- [ ] Implement user-scoped campaign_briefs CRUD with revision CAS; preserve `brief_json` structure and persona_snapshot.
- [ ] Honor tone count max 3, current market/language defaults only where existing product contract dictates.
- [ ] Expose no RBAC policy checks; validate user_key for reads and updates.

## Tests / proof of completion

- [ ] Malformed brief and >3 tones rejected.
- [ ] Second user cannot update brief.

## Acceptance and boundaries

- Keep exact v8 entity/field names; do not add a new table/collection merely to make this task easier.
- Reject cross-user access by server-derived `userKey`; `brandId` and future roles do not authorize reads/writes in this phase.
- ADK/Agent Runtime plus restricted MCP artifact/event tools ARE in scope. Do not implement DAG/topological scheduling, autonomous agent-led DAM search/selection, multi-image generation, RBAC enforcement, or Cloud Scheduler/Reconciler. Integrate through the defined runtime interfaces; do not move image generation into Node/FastAPI.
- Report: changed files, behavior, exact schema touched, tests run (with output), and remaining blockers. Never claim tests passed without running them.

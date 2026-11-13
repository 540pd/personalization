# INF-13 — Deploy Node BFF with Cloud SQL, Firestore, BigQuery and GCS

> **Claude Code — atomic implementation prompt.** The team reports `NJS-01..08` and `PY-01..04` are already done; **do not recreate them**. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/05_SCHEMA_REVIEW.md` and `../../Environment/VARIABLE_MATRIX.md`, along with real repository `CLAUDE.md`, routes, models and tests. Implement only this task; preserve existing code conventions. Never apply GCP production changes, IAM bindings or migrations without explicit approval; no auto-commit or git push.

**Status:** NEW — one-image ADK MVP.  **Dependencies:** INF-03,04,07,08,09,26.

## Goal and exact stores

No physical schema change required for this infrastructure setup task.

## Instructions to implement

- [ ] Deploy existing Node Cloud Run service with authenticated routes, bounded concurrency and SQL pool settings.
- [ ] Use env examples; keep GOOGLE_OAUTH_CLIENT_ID, ALLOWED_ORIGINS and SESSION_SECRET handling consistent with completed NJS-01..08.
- [ ] Disable production Node direct Vertex model calls for new single-image route; do not break legacy paths without approval.

## Tests / proof of completion

- [ ] Node liveness and authenticated storage checks pass.
- [ ] New Run route has no direct Vertex call.

## Acceptance and boundaries

- Keep exact v8 entity/field names; do not add a new table/collection merely to make this task easier.
- Reject cross-user access by server-derived `userKey`; `brandId` and future roles do not authorize reads/writes in this phase.
- ADK/Agent Runtime plus restricted MCP artifact/event tools ARE in scope. Do not implement DAG/topological scheduling, autonomous agent-led DAM search/selection, multi-image generation, RBAC enforcement, or Cloud Scheduler/Reconciler. Integrate through the defined runtime interfaces; do not move image generation into Node/FastAPI.
- Report: changed files, behavior, exact schema touched, tests run (with output), and remaining blockers. Never claim tests passed without running them.

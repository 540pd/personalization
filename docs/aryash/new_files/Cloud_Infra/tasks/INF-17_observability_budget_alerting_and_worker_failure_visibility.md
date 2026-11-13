# INF-17 — Observability, budget alerting and worker failure visibility

> **Claude Code — atomic implementation prompt.** The team reports `NJS-01..08` and `PY-01..04` are already done; **do not recreate them**. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/05_SCHEMA_REVIEW.md` and `../../Environment/VARIABLE_MATRIX.md`, along with real repository `CLAUDE.md`, routes, models and tests. Implement only this task; preserve existing code conventions. Never apply GCP production changes, IAM bindings or migrations without explicit approval; no auto-commit or git push.

**Status:** NEW — one-image ADK MVP.  **Dependencies:** INF-09,11,13,14.

## Goal and exact stores

Touch only: `job_events` (BigQuery), `job_analytics` (BigQuery).

## Instructions to implement

- [ ] Configure structured Cloud Logging/Trace fields: request_id, job_id, attempt_no; exclude prompts and asset bytes.
- [ ] Alert on Cloud Tasks retry exhaustion, DLQ-like/manual investigation signals, Cloud Run 5xx and stalled SQL dispatch states as passive monitoring.
- [ ] Document explicitly: Cloud Tasks alone cannot detect 2xx-acknowledged jobs left stuck; no scheduler/reconciler is created.

- [ ] Add ADK/Agent Runtime and MCP tool metrics/traces, model-call count, and cloud billing alerts; redact prompts/image bytes.

## Tests / proof of completion

- [ ] Ops dashboard exposes failure signals and correlation IDs.
- [ ] No new periodic recovery job is deployed.

## Acceptance and boundaries

- Keep exact v8 entity/field names; do not add a new table/collection merely to make this task easier.
- Reject cross-user access by server-derived `userKey`; `brandId` and future roles do not authorize reads/writes in this phase.
- ADK/Agent Runtime plus restricted MCP artifact/event tools ARE in scope. Do not implement DAG/topological scheduling, autonomous agent-led DAM search/selection, multi-image generation, RBAC enforcement, or Cloud Scheduler/Reconciler. Integrate through the defined runtime interfaces; do not move image generation into Node/FastAPI.
- Report: changed files, behavior, exact schema touched, tests run (with output), and remaining blockers. Never claim tests passed without running them.

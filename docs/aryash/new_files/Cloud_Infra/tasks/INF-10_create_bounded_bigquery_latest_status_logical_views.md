# INF-10 — Create bounded BigQuery latest status logical views

> **Claude Code — atomic implementation prompt.** The team reports `NJS-01..08` and `PY-01..04` are already done; **do not recreate them**. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/05_SCHEMA_REVIEW.md` and `../../Environment/VARIABLE_MATRIX.md`, along with real repository `CLAUDE.md`, routes, models and tests. Implement only this task; preserve existing code conventions. Never apply GCP production changes, IAM bindings or migrations without explicit approval; no auto-commit or git push.

**Status:** NEW — one-image, no-agent MVP.  **Dependencies:** INF-09.

## Goal and exact stores

Touch only: `bq_status_views` (BigQuery), `job_events` (BigQuery), `slot_events` (BigQuery).

## Instructions to implement

- [ ] Provide logical views v_job_latest and v_slot_ready with deterministic deduplication by event_id and attempt fence.
- [ ] Ensure job-scoped query examples filter event_ts partitions; validate scanned bytes with sample data.
- [ ] Do not claim BigQuery enforces unique event IDs or transactional current state.

## Tests / proof of completion

- [ ] View returns one effective ready slot for duplicate event rows.
- [ ] Partitioned job query cost is bounded and measured.

## Acceptance and boundaries

- Keep exact v8 entity/field names; do not add a new table/collection merely to make this task easier.
- Reject cross-user access by server-derived `userKey`; `brandId` and future roles do not authorize reads/writes in this phase.
- Do not implement ADK, MCP, agent tools, DAG execution, multi-image or RBAC enforcement. If behavior requires a future component, use a narrow interface/mocked dependency and document it.
- Report: changed files, behavior, exact schema touched, tests run (with output), and remaining blockers. Never claim tests passed without running them.

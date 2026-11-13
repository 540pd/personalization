# PY-22 — Write deterministic BigQuery job lifecycle events

> **Claude Code — atomic implementation prompt.** The team reports `NJS-01..08` and `PY-01..04` are already done; **do not recreate them**. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/05_SCHEMA_REVIEW.md` and `../../Environment/VARIABLE_MATRIX.md`, along with real repository `CLAUDE.md`, routes, models and tests. Implement only this task; preserve existing code conventions. No production deploy, destructive migrations, auto-commit or git push.

**Status:** NEW — one-image, no-agent MVP.  **Dependencies:** PY-15,16; INF-09.

## Goal and exact stores

Touch only: `job_events` (BigQuery).

## Instructions to implement

- [ ] Emit QUEUED/RUNNING/COMPLETED/FAILED status events from Python app code, not an LLM or MCP tool.
- [ ] Include stable event_id, job_id, user_key, attempt_no and lease_fence; redact metadata.
- [ ] Implement bounded retry for transient writer errors; note BigQuery does not enforce event_id uniqueness.

## Tests / proof of completion

- [ ] Same retry reuses event_id.
- [ ] SQL attempt transition remains authoritative.

## Acceptance and boundaries

- Keep exact v8 entity/field names; do not add a new table/collection merely to make this task easier.
- Reject cross-user access by server-derived `userKey`; `brandId` and future roles do not authorize reads/writes in this phase.
- Do not implement ADK, MCP, agent tools, DAG execution, multi-image or RBAC enforcement. If behavior requires a future component, use a narrow interface/mocked dependency and document it.
- Report: changed files, behavior, exact schema touched, tests run (with output), and remaining blockers. Never claim tests passed without running them.

# PY-26 — Deduplicate redelivered job and event side effects

> **Claude Code — atomic implementation prompt.** The team reports `NJS-01..08` and `PY-01..04` are already done; **do not recreate them**. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/05_SCHEMA_REVIEW.md` and `../../Environment/VARIABLE_MATRIX.md`, along with real repository `CLAUDE.md`, routes, models and tests. Implement only this task; preserve existing code conventions. No production deploy, destructive migrations, auto-commit or git push.

**Status:** NEW — one-image, no-agent MVP.  **Dependencies:** PY-13,15,22,23.

## Goal and exact stores

Touch only: `job_events` (BigQuery), `slot_events` (BigQuery), `job_admissions` (Cloud SQL).

## Instructions to implement

- [ ] Before work, check SQL job state and prior verified GCS output; return success for already terminal valid job.
- [ ] Keep stable event IDs, dedupe in BQ latest-state views/read models; do not claim BigQuery unique enforcement.
- [ ] Never execute two model calls due to duplicate Cloud Tasks dispatch while active lease exists.

## Tests / proof of completion

- [ ] Two duplicate Cloud Task calls trigger at most one active model call.
- [ ] Duplicate slot event does not duplicate displayed image.

## Acceptance and boundaries

- Keep exact v8 entity/field names; do not add a new table/collection merely to make this task easier.
- Reject cross-user access by server-derived `userKey`; `brandId` and future roles do not authorize reads/writes in this phase.
- Do not implement ADK, MCP, agent tools, DAG execution, multi-image or RBAC enforcement. If behavior requires a future component, use a narrow interface/mocked dependency and document it.
- Report: changed files, behavior, exact schema touched, tests run (with output), and remaining blockers. Never claim tests passed without running them.

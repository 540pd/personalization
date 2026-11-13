# PY-15 — Claim worker lease and attempt using Cloud SQL row lock

> **Claude Code — atomic implementation prompt.** The team reports `NJS-01..08` and `PY-01..04` are already done; **do not recreate them**. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/05_SCHEMA_REVIEW.md` and `../../Environment/VARIABLE_MATRIX.md`, along with real repository `CLAUDE.md`, routes, models and tests. Implement only this task; preserve existing code conventions. No production deploy, destructive migrations, auto-commit or git push.

**Status:** NEW — one-image, no-agent MVP.  **Dependencies:** PY-09,14.

## Goal and exact stores

Touch only: `job_admissions` (Cloud SQL), `board_runtime` (Cloud SQL).

## Instructions to implement

- [ ] Claim job_admissions row transactionally; advance attempt_no and lease_fence only when previous lease expired or unclaimed.
- [ ] Set lease_expires_at and heartbeat_at; verify board_runtime.lock_owner_job_id matches current logical job.
- [ ] Duplicate delivery with valid incumbent must not start another Vertex invocation.

## Tests / proof of completion

- [ ] Two workers racing result in one current lease.
- [ ] Stale/terminal job cannot be claimed.

## Acceptance and boundaries

- Keep exact v8 entity/field names; do not add a new table/collection merely to make this task easier.
- Reject cross-user access by server-derived `userKey`; `brandId` and future roles do not authorize reads/writes in this phase.
- Do not implement ADK, MCP, agent tools, DAG execution, multi-image or RBAC enforcement. If behavior requires a future component, use a narrow interface/mocked dependency and document it.
- Report: changed files, behavior, exact schema touched, tests run (with output), and remaining blockers. Never claim tests passed without running them.

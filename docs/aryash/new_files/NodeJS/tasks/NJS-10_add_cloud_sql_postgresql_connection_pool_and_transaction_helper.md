# NJS-10 — Add Cloud SQL PostgreSQL connection pool and transaction helper

> **Claude Code — atomic implementation prompt.** The team reports `NJS-01..08` and `PY-01..04` are already done; **do not recreate them**. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/05_SCHEMA_REVIEW.md` and `../../Environment/VARIABLE_MATRIX.md`, along with real repository `CLAUDE.md`, routes, models and tests. Implement only this task; preserve existing code conventions. No production deploy, destructive migrations, auto-commit or git push.

**Status:** NEW — one-image, no-agent MVP.  **Dependencies:** NJS-09; INF-04.

## Goal and exact stores

Touch only: `users` (Cloud SQL).

## Instructions to implement

- [ ] Use the existing data access stack/ORM if present; configure bounded pool, query timeout, server timestamps, and safe shutdown.
- [ ] Provide reusable transaction wrapper with rollback and parameterized queries; no network calls inside SQL transactions.
- [ ] Configure local connection vs Cloud Run Unix socket/private networking without embedding passwords.

## Tests / proof of completion

- [ ] Rollback leaves no partial writes.
- [ ] Pool exhaustion and connection failure return safe errors.

## Acceptance and boundaries

- Keep exact v8 entity/field names; do not add a new table/collection merely to make this task easier.
- Reject cross-user access by server-derived `userKey`; `brandId` and future roles do not authorize reads/writes in this phase.
- Do not implement ADK, MCP, agent tools, DAG execution, multi-image or RBAC enforcement. If behavior requires a future component, use a narrow interface/mocked dependency and document it.
- Report: changed files, behavior, exact schema touched, tests run (with output), and remaining blockers. Never claim tests passed without running them.

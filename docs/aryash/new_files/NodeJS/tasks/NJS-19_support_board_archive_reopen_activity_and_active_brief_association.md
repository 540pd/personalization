# NJS-19 — Support board archive, reopen activity and active brief association

> **Claude Code — atomic implementation prompt.** The team reports `NJS-01..08` and `PY-01..04` are already done; **do not recreate them**. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/05_SCHEMA_REVIEW.md` and `../../Environment/VARIABLE_MATRIX.md`, along with real repository `CLAUDE.md`, routes, models and tests. Implement only this task; preserve existing code conventions. No production deploy, destructive migrations, auto-commit or git push.

**Status:** NEW — one-image, no-agent MVP.  **Dependencies:** NJS-16,21.

## Goal and exact stores

Touch only: `boards` (Cloud SQL), `campaign_briefs` (Cloud SQL).

## Instructions to implement

- [ ] Add ownership-checked archive and read-only retrieval for archived boards; update last_opened_at when appropriate.
- [ ] Validate active_brief_id belongs to same user before binding to board.
- [ ] Keep existing board_runtime lock semantics untouched.

## Tests / proof of completion

- [ ] Foreign brief association denied.
- [ ] Archived board rejects new Run.

## Acceptance and boundaries

- Keep exact v8 entity/field names; do not add a new table/collection merely to make this task easier.
- Reject cross-user access by server-derived `userKey`; `brandId` and future roles do not authorize reads/writes in this phase.
- Do not implement ADK, MCP, agent tools, DAG execution, multi-image or RBAC enforcement. If behavior requires a future component, use a narrow interface/mocked dependency and document it.
- Report: changed files, behavior, exact schema touched, tests run (with output), and remaining blockers. Never claim tests passed without running them.

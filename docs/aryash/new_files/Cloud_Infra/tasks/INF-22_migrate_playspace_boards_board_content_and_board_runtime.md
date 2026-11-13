# INF-22 — Migrate Playspace boards, board_content and board_runtime

> **Claude Code — atomic implementation prompt.** The team reports `NJS-01..08` and `PY-01..04` are already done; **do not recreate them**. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/05_SCHEMA_REVIEW.md` and `../../Environment/VARIABLE_MATRIX.md`, along with real repository `CLAUDE.md`, routes, models and tests. Implement only this task; preserve existing code conventions. Never apply GCP production changes, IAM bindings or migrations without explicit approval; no auto-commit or git push.

**Status:** NEW — one-image, no-agent MVP.  **Dependencies:** INF-05,19.

## Goal and exact stores

Touch only: `boards` (Cloud SQL), `board_content` (Cloud SQL), `board_runtime` (Cloud SQL).

## Instructions to implement

- [ ] Create three SQL tables with board_id FK and lock/cas columns.
- [ ] Keep ADK session fields nullable and unused; select canonical nodes_json/edges_json/viewport_json mapping after review.
- [ ] Index user_key/board_id and prepare row-level lock access pattern.

## Tests / proof of completion

- [ ] Board/content/runtime share one stable board_id.
- [ ] Concurrent SQL lock transaction is serialized.

## Acceptance and boundaries

- Keep exact v8 entity/field names; do not add a new table/collection merely to make this task easier.
- Reject cross-user access by server-derived `userKey`; `brandId` and future roles do not authorize reads/writes in this phase.
- Do not implement ADK, MCP, agent tools, DAG execution, multi-image or RBAC enforcement. If behavior requires a future component, use a narrow interface/mocked dependency and document it.
- Report: changed files, behavior, exact schema touched, tests run (with output), and remaining blockers. Never claim tests passed without running them.

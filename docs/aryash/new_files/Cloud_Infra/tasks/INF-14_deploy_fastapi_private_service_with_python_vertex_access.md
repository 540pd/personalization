# INF-14 — Deploy FastAPI private service with Python Vertex access

> **Claude Code — atomic implementation prompt.** The team reports `NJS-01..08` and `PY-01..04` are already done; **do not recreate them**. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/05_SCHEMA_REVIEW.md` and `../../Environment/VARIABLE_MATRIX.md`, along with real repository `CLAUDE.md`, routes, models and tests. Implement only this task; preserve existing code conventions. Never apply GCP production changes, IAM bindings or migrations without explicit approval; no auto-commit or git push.

**Status:** NEW — one-image, no-agent MVP.  **Dependencies:** INF-03,04,08,09,12,26.

## Goal and exact stores

No physical schema change required for this infrastructure setup task.

## Instructions to implement

- [ ] Deploy Python FastAPI Cloud Run service privately, with Cloud SQL access, Vertex permission and GCS/BQ service scopes.
- [ ] Configure request timeout to accommodate Cloud Tasks worker execution within platform limits.
- [ ] No Agent Engine/ADK/MCP deployment in this phase.

## Tests / proof of completion

- [ ] Node and Cloud Tasks invoke approved endpoints only.
- [ ] One-image mock integration runs under private service.

## Acceptance and boundaries

- Keep exact v8 entity/field names; do not add a new table/collection merely to make this task easier.
- Reject cross-user access by server-derived `userKey`; `brandId` and future roles do not authorize reads/writes in this phase.
- Do not implement ADK, MCP, agent tools, DAG execution, multi-image or RBAC enforcement. If behavior requires a future component, use a narrow interface/mocked dependency and document it.
- Report: changed files, behavior, exact schema touched, tests run (with output), and remaining blockers. Never claim tests passed without running them.

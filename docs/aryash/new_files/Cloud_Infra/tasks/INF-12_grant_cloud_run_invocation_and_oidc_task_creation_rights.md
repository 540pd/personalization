# INF-12 — Grant Cloud Run invocation and OIDC task creation rights

> **Claude Code — atomic implementation prompt.** The team reports `NJS-01..08` and `PY-01..04` are already done; **do not recreate them**. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/05_SCHEMA_REVIEW.md` and `../../Environment/VARIABLE_MATRIX.md`, along with real repository `CLAUDE.md`, routes, models and tests. Implement only this task; preserve existing code conventions. Never apply GCP production changes, IAM bindings or migrations without explicit approval; no auto-commit or git push.

**Status:** NEW — one-image, no-agent MVP.  **Dependencies:** INF-02,03,11.

## Goal and exact stores

No physical schema change required for this infrastructure setup task.

## Instructions to implement

- [ ] Grant tasks service account roles/run.invoker on Python Cloud Run; FastAPI enqueuer needs tasks.create plus actAs of OIDC identity.
- [ ] Grant Node service identity roles/run.invoker on private Python dispatcher API.
- [ ] Set exact audience URL; verify wrong service-account calls denied.

## Tests / proof of completion

- [ ] Expected service identity can invoke.
- [ ] Unauthenticated internet invocation returns denied.

## Acceptance and boundaries

- Keep exact v8 entity/field names; do not add a new table/collection merely to make this task easier.
- Reject cross-user access by server-derived `userKey`; `brandId` and future roles do not authorize reads/writes in this phase.
- Do not implement ADK, MCP, agent tools, DAG execution, multi-image or RBAC enforcement. If behavior requires a future component, use a narrow interface/mocked dependency and document it.
- Report: changed files, behavior, exact schema touched, tests run (with output), and remaining blockers. Never claim tests passed without running them.

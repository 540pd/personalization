# INF-03 — Define minimum IAM bindings for Node, Python, ADK, MCP and Cloud Tasks

> **Claude Code — atomic implementation prompt.** The team reports `NJS-01..08` and `PY-01..04` are already done; **do not recreate them**. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/05_SCHEMA_REVIEW.md` and `../../Environment/VARIABLE_MATRIX.md`, along with real repository `CLAUDE.md`, routes, models and tests. Implement only this task; preserve existing code conventions. Never apply GCP production changes, IAM bindings or migrations without explicit approval; no auto-commit or git push.

**Status:** NEW — one-image ADK MVP.  **Dependencies:** INF-02.

## Goal and exact stores

No physical schema change required for this infrastructure setup task.

## Instructions to implement

- [ ] Node: Cloud SQL Client, scoped Firestore DAM access, GCS input + authorized output reads, BigQuery job read, FastAPI invoker.
- [ ] Python: Cloud SQL Client, GCS manifest/input reads + attempt-scoped output creates, BQ write, Cloud Tasks enqueuer, Vertex AI User.
- [ ] Task identity: FastAPI Cloud Run invoker only; task creator requires serviceAccountUser for designated OIDC identity.
- [ ] Replace broad project editor roles with resource-scoped grants wherever possible.

- [ ] Define ADK identity with model+Registry read only; separate MCP gateway identity with scoped GCS/BQ access; FastAPI only invokes ADK and owns SQL worker lifecycle.

## Tests / proof of completion

- [ ] Service can perform expected API calls and denies unrelated resources.
- [ ] IAM matrix documents principal/resource/permission.

## Acceptance and boundaries

- Keep exact v8 entity/field names; do not add a new table/collection merely to make this task easier.
- Reject cross-user access by server-derived `userKey`; `brandId` and future roles do not authorize reads/writes in this phase.
- ADK/Agent Runtime plus restricted MCP artifact/event tools ARE in scope. Do not implement DAG/topological scheduling, autonomous agent-led DAM search/selection, multi-image generation, RBAC enforcement, or Cloud Scheduler/Reconciler. Integrate through the defined runtime interfaces; do not move image generation into Node/FastAPI.
- Report: changed files, behavior, exact schema touched, tests run (with output), and remaining blockers. Never claim tests passed without running them.

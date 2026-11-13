# INF-08 — Configure one private GCS bucket with input/ and output/ paths

> **Claude Code — atomic implementation prompt.** The team reports `NJS-01..08` and `PY-01..04` are already done; **do not recreate them**. Read `../../01_FROZEN_SCOPE.md`, `../../Shared/02_SCHEMA_OWNERSHIP.md`, `../../Shared/03_API_CONTRACTS.md`, `../../Shared/05_SCHEMA_REVIEW.md` and `../../Environment/VARIABLE_MATRIX.md`, along with real repository `CLAUDE.md`, routes, models and tests. Implement only this task; preserve existing code conventions. Never apply GCP production changes, IAM bindings or migrations without explicit approval; no auto-commit or git push.

**Status:** NEW — one-image, no-agent MVP.  **Dependencies:** INF-01,03.

## Goal and exact stores

Touch only: `gcs_input` (GCS), `gcs_output` (GCS), `gcs_object_properties` (GCS).

## Instructions to implement

- [ ] Configure one bucket named gcos-personalization-{env} or agreed unique variant, public access prevention and uniform bucket-level access.
- [ ] Use only top-level input/ and output/ object prefixes; enforce generation preconditions in app.
- [ ] Document object lifecycle, soft delete, retention and CORS constraints with no second bucket.

## Tests / proof of completion

- [ ] No public objects or bucket ACLs.
- [ ] Test input and output object paths in same bucket.

## Acceptance and boundaries

- Keep exact v8 entity/field names; do not add a new table/collection merely to make this task easier.
- Reject cross-user access by server-derived `userKey`; `brandId` and future roles do not authorize reads/writes in this phase.
- Do not implement ADK, MCP, agent tools, DAG execution, multi-image or RBAC enforcement. If behavior requires a future component, use a narrow interface/mocked dependency and document it.
- Report: changed files, behavior, exact schema touched, tests run (with output), and remaining blockers. Never claim tests passed without running them.

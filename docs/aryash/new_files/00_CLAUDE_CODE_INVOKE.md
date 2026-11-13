# Claude Code invocation (one task at a time)

Read `01_FROZEN_SCOPE.md`, `Shared/02_SCHEMA_OWNERSHIP.md`, `Shared/03_API_CONTRACTS.md`, `Shared/04_DEPENDENCY_WAVES.md`, `Shared/06_COMPONENT_BOUNDARIES.md` and `Shared/05_SCHEMA_REVIEW.md`. Inspect the actual repo and its `CLAUDE.md` before editing. NJS-01..08 and PY-01..04 have already been completed.

**Implement ONLY:** `<relative/path/to/selected/task.md>`

Critical: image generation belongs ONLY to ADK via Vertex AI. FastAPI handles Cloud Tasks, auth, SQL attempt fencing, ADK invocation and result verification; Node handles app authorization, admission, DAM, status and binary proxy. No DAG, autonomous agent DAM search, multi-image or RBAC enforcement. Use exact v8 physical names. No secrets in env examples. Do not deploy or alter production resources without approval. At completion show files, schema changes, test commands + output, risks, follow-on dependencies. Do not continue to other tasks without instruction.

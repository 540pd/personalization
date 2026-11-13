# START HERE — GCOS one-image ADK MVP Claude Code task pack v9

**Correction over v8:** The old task pack wrongly assigned Vertex image generation to a direct Python FastAPI worker. **This pack removes that design.** FastAPI manages async dispatch/leases and invokes a dedicated Google ADK runtime; ADK uses Vertex AI, a restricted MCP artifact service, and a restricted BigQuery event writer.

## Task folders
- `NodeJS/`: **NJS-09..60 (52)** integration/persistence/UI-backend tasks. NJS-01..08 already complete.
- `Python/`: **PY-05..28 (24)** private FastAPI dispatcher/worker, OIDC, leases, handoff/result handling. PY-01..04 already complete.
- `ADK/`: **ADK-01..26 (26)** actual ADK one-image agent runtime and MCP tool implementations.
- `Cloud_Infra/`: **INF-01..33 (33)** cloud setup/migrations plus Agent Runtime, MCP service and rollout.
- `Environment/`: sanitized Node, Python, ADK, MCP and frontend env examples; variable status matrix.
- `Shared/`: frozen contracts, exact schema ownership, dependency waves, schema review, component boundaries.
- `References/`: unchanged user-provided authoritative v8 MD/ERD, v5 architecture, historic env inventory.

## Frozen constraints
One selected node → **one** generated image. No DAG, no agent-led DAM search/retrieval, no RBAC enforcement, no Cloud Scheduler/Reconciler. All other ADK responsibilities shown in architecture (plan, Skill revisions, guardrails, Vertex, artifact tools, event traces) are in scope. `userKey` authorizes now, `brandId` is nullable context only.

## How to use with Claude Code
1. Read `01_FROZEN_SCOPE.md`, `Shared/02_SCHEMA_OWNERSHIP.md`, `Shared/03_API_CONTRACTS.md`, `Shared/04_DEPENDENCY_WAVES.md`, `Shared/06_COMPONENT_BOUNDARIES.md`, `Shared/05_SCHEMA_REVIEW.md`.
2. Choose **one** atomic task in the correct folder. Give Claude Code that task file plus the sources and real repo.
3. Require it to inspect existing NJS-01..08 and PY-01..04, make smallest changes, add tests, show changed files and exact execution results.
4. Respect prerequisites/dependencies; cloud state-changing actions need an explicit human approval.
5. Test local mock end-to-end before invoking real model, then gated staging integration.

**Important:** Old v8 ZIP should not be used for FastAPI image generation. In v9 PY-19 means *invoke ADK*, not *call Vertex directly*.

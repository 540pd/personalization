# START HERE — GCOS Personalization One-Image MVP Task Pack v8

**Prepared from:** `GCOS_Modular_DAM_Data_Model_v8`, `GCOS_Modular_DAM_ERD_v8`, updated `GCOS_Full_Architecture_v5`, and sanitized existing environment inventory (included under `References/`).

## Deliverables
- **NodeJS/TASKS.md**: 52 new atomic Node.js BFF tasks, starting at NJS-09.
- **Python/TASKS.md**: 24 new atomic FastAPI tasks, starting at PY-05.
- **Cloud_Infra/TASKS.md**: 26 atomic cloud infrastructure tasks, starting at INF-01.
- **Shared/02_SCHEMA_OWNERSHIP.md**: exact v8 41 schema blocks + field-label dictionary.
- **Environment/**: four sanitized `.env.example` configurations plus ownership/status matrix.
- **Shared/05_SCHEMA_REVIEW.md**: source ambiguities to resolve deliberately; no destructive guessed migration.

## Development instruction
Provide Claude Code the **selected single task file**, `01_FROZEN_SCOPE.md`, `Shared/02_SCHEMA_OWNERSHIP.md`, `Shared/03_API_CONTRACTS.md` and your real code repository. Ask Claude Code to inspect existing code first, implement the task and report changed files and test output. Do not give it the entire pack as one undifferentiated instruction to rewrite everything.

## Already completed by your team
**NJS-01 through NJS-08 and PY-01 through PY-04.** Do not restart them or generate duplicate routes. New adapter work can integrate their behavior with the updated SQL persistence model.

## Current MVP constraints
- 1 image per Run, selected image node only, no DAG.
- No agent, Agent Engine, ADK session, or MCP runtime task files.
- Role fields stored in schema, RBAC NOT implemented.
- Cloud SQL transactions; Firestore modular DAM; BigQuery three event tables / logical status views; one private GCS bucket (`input/`, `output/`).
- Cloud Tasks OIDC and retries only, **no reconciler / no Cloud Scheduler**.
- Node authenticates and owns authorization/asset delivery; Python calls Vertex for generation; published Skills in Agent Registry.

## Important note about environment example
The uploaded environment inventory is from a checkout that apparently does not yet contain Python, and its Node backend still calls Vertex directly. This conflicts with the reported completed NJS/PY milestones and new diagram. Treat that as evidence of **repo state uncertainty**, not a reason to recreate your completed work or silently migrate legacy routes. Configuration examples label proposed keys clearly. No secrets copied.

## Counts and quality gate
- NodeJS: 52 tasks; Python: 24 tasks; Cloud Infra: 26 tasks.
- 41 exact schema blocks: 16 SQL tables, 17 Firestore collections, 3 BQ physical tables + logical view group, 4 GCS contracts.
- The source ERD is retained as a readable reference; no architecture diagram changes have been made in this ZIP.

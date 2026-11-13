# GCOS One-image MVP — frozen task constraints

**Source precedence:** v8 data model and v8 ERD govern physical schema / collection / field names; updated v5 architecture governs BFF / FastAPI / Cloud Tasks flows; current user instructions override both for implementation phase. Existing environment inventory is a historical snapshot, **not evidence that a Python repository already exists**.

## Completed; NEVER reissue or implement from scratch
- NJS-01 through NJS-08: Google ID verification, immutable userKey/identity, opaque sessions, CSRF, idempotency, Playspace lock, ownership/lineage, signed FastAPI client — **reported completed by team**. Rewire existing code to Cloud SQL where v8 requires, without changing behavior.
- PY-01 through PY-04: Skills CRUD, Registry publish, tool catalog validation and AI Skill helper — **reported completed by team**. Preserve and integrate.

## In scope NOW
- One user-selected image node per Run; **exactly one generated image** (slot index **0**, provisional integration convention, adapt if repo has an approved index convention).
- Node Cloud Run BFF: authenticated userKey access, Cloud SQL transactional app state, Firestore modular DAM, single private GCS bucket, BigQuery status read, secure image stream, feedback capture.
- Python FastAPI Cloud Run: small single-run dispatcher, Cloud Tasks enqueue/job-ID only, OIDC worker handler, SQL lease/fence, **direct non-agent Vertex AI generation of one image**, create-only output GCS and BigQuery events.
- Store roles, grants and approval fields as schema data only. `brandId` nullable context, **not authorization**. Authorization in this MVP is by authenticated `userKey`.

## Explicitly OUT of scope
- Custom Agent Runtime, Agent Engine, ADK, agent registry for new runtime agents, ADK sessions, MCP DAM search / Artifact MCP / BigQuery MCP, multi-agent planning, graph/DAG resolver, topological execution, multi-image generation.
- RBAC evaluation, role permission enforcement, cross-user Brand sharing, new role-management endpoints, automatic creative preference learning.
- Cloud Scheduler, standalone Reconciler, periodic recovery scan, a new database/table/collection for operational state without approval.
- Node invoking Vertex AI for newly added generation route. Existing legacy Node code may be retained behind a clearly documented migration boundary; do not silently delete existing capabilities.

## Important phase adapter
The architecture diagram shows ADK/MCP producing images/events. **Only for this interim phase**, direct Python worker code takes responsibility for the same output and event contracts. Future ADK can replace the worker implementation later without changing approved GCS/SQL/BQ contracts. This is a deliberate temporary deviation and MUST be labeled in code/docs.

## Execution safety and review stops
- Cloud SQL is authoritative for user/session/admission/board lock/worker fence; Firestore is authoritative for DAM modular metadata; BigQuery for append-only job/slot/analytics events; GCS for immutable bytes/manifest; published Skills stay in Agent Registry.
- No network call inside SQL transaction. Firestore and SQL/BQ/GCS writes are not cross-service atomic. Idempotent retries + stable IDs required.
- Cloud Tasks retries **failed/unacknowledged HTTP deliveries**, but does not discover successfully acknowledged stuck jobs. Never acknowledge 2xx before durable terminal completion, and never automatically repeat a Vertex call after an ambiguous timeout. Retry exhaustion needs operations handling.
- Missing or ambiguous source contract is logged in `Shared/05_SCHEMA_REVIEW.md`; don't silently invent/rename physical fields or migrate data destructively. Adapt `slot_index=0` if approved code differs.
- Every task: inspect `CLAUDE.md`, current code, repo conventions, migrations/tests before modifications; implement only task; run tests; report changed files, commands/results, remaining blockers. No push, production deployment or schema migration without approval.

# v9 Component boundaries and strict ownership

| Component | SHOULD own | MUST NOT own |
|---|---|---|
| Next.js Playspace | image upload/select, Run click, poll status, show saved output | direct private GCS or Agent Runtime credentials |
| Node.js BFF | userKey session + ownership; Cloud SQL board/admission; Firestore modular DAM; GCS input proxy/upload; BigQuery status read and output binary proxy; feedback | Vertex AI inference, LLM planning, ADK session execution |
| FastAPI control plane | Skills APIs (existing PY-01..04); validate private Node calls; single-job dispatch; Cloud Tasks enqueuing; worker OIDC; SQL attempt lease/fence; call ADK; verify completion; terminal SQL transaction | direct Gemini/Vertex image generation, direct DAM search, raw image byte transformation |
| Google ADK runtime (Agent Runtime/Engine) | bound single-image plan, pinned Skills, preservation guardrails, **Vertex AI image call**, output verification, ADK session, event forwarding | DAG/topological orchestration, autonomous DAM searches, cross-user asset discovery |
| Restricted MCP artifact service | authorized run-scoped input byte fetch and attempt-scoped create-only output write, generation/CRC checks | arbitrary user GCS paths, unscoped listing or overwrite |
| Restricted MCP event service | deterministic event payload validation, authoritative attempt fence, stable event IDs, BigQuery job/slot/usage writes | free-form LLM SQL, trusting supplied actor identity, assuming BQ PK uniqueness |
| Cloud SQL | users/identity/sessions/brands/boards/skills refs/idempotency/jobs/lease/audit | image bytes or DAM metadata |
| Firestore | 17 exact modular DAM collections | live job attempt lease authority |
| GCS | one private asset bucket, `input/`/`output/` paths | DAM tags, SQL authorization |
| BigQuery | `job_events`,`slot_events`,`job_analytics`, derived `v_job_latest`,`v_slot_ready` | SQL transactions/lease authority |
| Agent Registry | immutable published Skill content/revisions | duplicate published `SKILL.md` in SQL/GCS |

## Handoff
Node admission → FastAPI enqueue → Cloud Tasks private OIDC → FastAPI claim SQL fence → invoke ADK with immutable manifest reference, accepted attempt/fence and scoped handles → ADK agent plans and calls Vertex → verifies one image → MCP write GCS attempt path → MCP writer posts fenced `slot_ready` to BQ → FastAPI verifies accepted receipt and commits SQL terminal state → Node queries BQ + SQL fence then streams exact generation → feedback captures modular Firestore metadata.

No Cloud Scheduler/Reconciler. Cloud Tasks retry is NOT a stuck-job scanner. In case of timeout of remote model execution of uncertain outcome, do not auto-invoke second model call; use state `needs_clarification`/terminal uncertain handling per existing API contract and require explicit user action/manual support. Do not fabricate a new required DB table to solve this.

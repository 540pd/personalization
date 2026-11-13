# GCOS Personalization — frozen scope: one-image MVP WITH ADK

## Reference precedence and existing work
- Latest user direction overrides the previous no-agent interim plan: **ADK is the ONLY image-generation runtime**. FastAPI dispatches and invokes ADK; it NEVER calls image-generation models itself.
- `References/GCOS_Modular_DAM_Data_Model_v8.md` and matching ERD govern exact schema names, types, nullable fields and one-to-one modular Firestore DAM documents. No invented tables or renaming.
- `References/GCOS_Full_Architecture_v5.html` governs component boundaries. Unlike its future-looking multi-node/DAG labels, CURRENT run accepts ONE selected image node and ONE output slot.
- `NJS-01..08` and `PY-01..04` are REPORTED COMPLETE. Inspect existing code first; migrate adapters where needed, don't redo them.

## IN scope NOW
- Node BFF: existing Google Sign-In/opaque sessions, userKey ownership, Cloud SQL transactions, single-image Run admission, Firestore modular DAM upload/capture, GCS binary proxy, BigQuery job+slot polling, Skills references, feedback.
- FastAPI on private Cloud Run: Skills APIs already built; one-image dispatcher, Cloud Tasks enqueue, OIDC task handler, Cloud SQL lease/attempt and board-lock handling, authenticated call to deployed **ADK runtime**, safe completion verification and error classification.
- ADK custom runtime deployed to Google Agent Runtime / Agent Engine as indicated in architecture (local test adapter first); one Playspace session, constrained Plan agent, prompt/Skills/guardrails, **one image call through Vertex AI**, verification, artifact IO through run-scoped MCP, deterministic events and usage. Prefer explicit bounded steps over open-ended autonomous loops.
- MCP Toolbox: **Artifact reader/writer and BigQuery event writer** only. Implement as run-scoped tools; do not allow arbitrary object or table names. Application-controlled events MUST be emitted deterministically; LLM may not opt out of mandatory writes.
- Cloud SQL for exact 16 transactional tables; Firestore for exact 17 modular DAM collections; BigQuery for `job_events`, `slot_events`, `job_analytics` and logical views `v_job_latest`,`v_slot_ready`; ONE private GCS asset bucket using `input/`, `output/` prefixes.
- Brand and role fields persisted as in v8, `brandId` nullable; **`userKey` is current authorization principal**. Published Skill revisions remain ONLY in Agent Registry; Cloud SQL stores refs/summaries, never duplicates published Skill source.

## Explicitly OUT of scope
- Multi-node DAG/graph resolver, topological dependencies, multiple image slots per Run (count=1 only).
- **Agent-selected DAM references**, `dam.search_candidates` or autonomous Firestore DAM browsing. Explicit user-selected, Node-authorized asset IDs are allowed as Run inputs.
- RBAC role enforcement, Brand-level shared access based solely on brandId, role administration, automatic user preference learning.
- Cloud Scheduler, standalone Reconciler, periodic job sweeps; do not claim Cloud Tasks rescues acknowledged stuck work.
- Node/FastAPI direct Vertex image-generation calls; temporary Python direct-generation adapter from old v8 plan is REMOVED.

## Safety and failure invariants
- Cloud Tasks authenticates to FastAPI Worker with Google-signed OIDC ID token; Node→FastAPI uses separate service OIDC. Browser sends neither service token nor GCS credentials.
- FastAPI Cloud SQL claim/renew/finalize owns attempt+lease fence. ADK/MCP write tools must validate an *authoritative* attempt/lease before accepting canonical output/event; avoid TOCTOU (read-then-write without atomic commit).
- GCS create-only objects live in **attempt-scoped paths**. ADK gets a validated narrow input/output allowlist, never arbitrary paths. `slot_ready` is published only after object generation/bytes verified and accepted by current SQL attempt; Node crosschecks SQL fence when reading BQ.
- Deterministic event IDs and replay-safe handling. BQ primary keys are not enforced. No automatic model re-invocation when request outcome is uncertain; bounded invocation and max-call limits.
- **Do not return Cloud Tasks HTTP 2xx until durable terminal job state is committed.** HTTP target max dispatch deadline is 30 min; configure job/runtime limits within that ceiling. Retries happen only for failed/unacknowledged tasks.
- Never perform a network call inside a Cloud SQL transaction; DB state plus external writes need safe idempotent protocol. Any gap requiring a new durable state store must be raised for approval rather than invented.
- Maintain complete production auth and privacy controls. Task files are prompts, NOT deployment permission. Do not apply IAM, migrations, deploys or destructive changes without operator review/approval.

## Implementation discipline
Every Claude Code task: inspect actual repository and `CLAUDE.md`, implement only selected task, run relevant tests, list changed files, exact schema touched and blockers. If a spec is unconfirmed or a provider SDK API has moved, verify current official SDK/docs and propose the narrowest compliant adaptation before coding. No auto-commit/push.

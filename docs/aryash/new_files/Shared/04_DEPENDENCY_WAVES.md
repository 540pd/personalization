# Practical development order and parallel work

**First:** Read the v8 schema and resolve blocking alias choices (Shared/05_SCHEMA_REVIEW.md). Infra DB and service identities can be provisioned in parallel with code repository audits.

| Wave | Node team | Python team | Cloud team |
|---|---|---|---|
| 0 | NJS-09 (audit) | PY-05, PY-06 (scaffold/env) | INF-01..03 (resources & IAM planning) |
| 1 | NJS-10..15 (SQL adapters; preserve completed BFF) | PY-07..11 (verified dispatch inputs, one slot) | INF-04..10 + INF-19..26 (granular SQL migrations + stores) |
| 2 | NJS-16..24 (boards/briefs/settings/Skills metadata) | PY-12..16 (Cloud Tasks OIDC/lease) | INF-11..12 (queue/auth) |
| 3 | NJS-25..41 and NJS-55..60 (modular DAM, typed details, uploads, proxies) | PY-17..23 (single image Vertex, output + BQ) | INF-13..16 (Cloud Run/secrets/CI) |
| 4 | NJS-42..53 (Run admission/status/capture/feedback) | PY-24..27 (terminalization/retry/analytics) | INF-17 (visibility) |
| 5 | NJS-54 (integration) | PY-28 (failure matrix) | INF-18 (smoke/rollback) |

Real dependencies are specified in each task; waves are **not** a mandate to run every task serially. NJS-01..08 and PY-01..04 remain completed and are not recopied here.

No Cloud Scheduler/Reconciler. A Cloud Tasks retry only occurs if the corresponding HTTP delivery was not acknowledged with a successful response. Track enqueue failure, retry exhaustion, and ambiguous model timeout as explicit operational risks.

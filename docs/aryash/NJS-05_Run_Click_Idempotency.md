# NJS-05 — Run-click idempotency at admission


> **Claude Code implementation task — approved functional scope.** Work in the existing repository; do not create a parallel application. First inspect `CLAUDE.md`, package config, related routes/services/models/tests, and relevant checked-in architecture docs. Follow `../01_FROZEN_ARCHITECTURE_RULES.md` and `../02_SHARED_CONTRACTS.md` when supplied. Latest November HLD/LLD is authoritative. Implement **only this task**; use typed interfaces/stubs for out-of-scope dependencies. No deploy, no production IAM/data change, no auto-commit/push.
>
> **Final response requirement:** Report (1) what already existed, (2) changed files, (3) precise behavior, (4) tests run and results, (5) follow-on dependencies or decisions. Do not claim tests passed unless run.

## Goal and architectural location

A browser can retry or double-send a Run click. The BFF must bind a client-created idempotency key to **one logical job per owner** and reject reusing it with a different request. Uploaded storage map: Firestore `idempotency/{owner_key}:{key}`.

## Scope to implement
1. Reuse the existing Run POST API if present. Require a bounded-format idempotency key (header or existing contract) for real Run requests. Scope uniqueness by **authenticated owner key**. Canonicalize the semantically relevant validated request fields to a stable fingerprint; exclude irrelevant fields such as request timestamps/tracing IDs.
2. Design a transactional Firestore repository with `owner_key`, key, fingerprint, stable reserved job ID, state (`pending/accepted/failed` or established equivalent), and expiry. Use **7-day replay retention** if not superseded by current approved repo config.
3. Coordinate with NJS-06: **idempotency reservation and Playspace admission lock belong to one atomic transaction**. Never run a FastAPI network call inside the transaction.
4. First valid key reserves a stable logical job; same key + same payload returns the existing accepted job or unambiguous pending result; same key + changed payload returns a conflict. Another key targeting the same busy Playspace must not create another active job.
5. For a downstream timeout with uncertain creation, keep the stable pending reservation for reconciliation—**do not generate a second job ID and blindly submit again**. The future dispatcher must dedupe the same stable ID; if absent today, add a narrow interface and mark end-to-end dispatch dependent on its implementation.
6. Retention expiry and failure cleanup may not allow replay to bypass an active Playspace lock; enforce owner/lock checks every time.

## Suggested Firestore record
```text
idempotency/{owner_key}:{key}
  owner_key, key, request_fingerprint, playspace_id,
  reserved_job_id, status, created_at, expires_at
```
Names and return codes should follow repo conventions; do not create conflicting collections.

## Tests to add
- First call creates one reservation; exact retry returns same job ID.
- Same key with different prompt/assets/parents/count -> conflict.
- Concurrent same-key calls cannot create two jobs.
- Different key same Playspace -> busy, no duplicate run.
- Timeout during FastAPI call preserves pending stable ID and doesn't duplicate.
- Different owners may reuse a string key without collision.

## Acceptance / stop conditions
- One logical job per owner+key during retention, with a clear pending/accepted contract.
- No side effects inside Firestore transaction; integrate NJS-06 rather than shipping a second lock code path.
- **Out of scope:** actual DAG dispatcher, queue enqueue, worker crash reconciler, duplicate model invocation guarantees.

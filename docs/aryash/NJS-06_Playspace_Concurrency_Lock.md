# NJS-06 — Atomic per-Playspace concurrency admission lock


> **Claude Code implementation task — approved functional scope.** Work in the existing repository; do not create a parallel application. First inspect `CLAUDE.md`, package config, related routes/services/models/tests, and relevant checked-in architecture docs. Follow `../01_FROZEN_ARCHITECTURE_RULES.md` and `../02_SHARED_CONTRACTS.md` when supplied. Latest November HLD/LLD is authoritative. Implement **only this task**; use typed interfaces/stubs for out-of-scope dependencies. No deploy, no production IAM/data change, no auto-commit/push.
>
> **Final response requirement:** Report (1) what already existed, (2) changed files, (3) precise behavior, (4) tests run and results, (5) follow-on dependencies or decisions. Do not claim tests passed unless run.

## Goal and architectural location

Only **one active logical Run job per (owner, Playspace)** may be admitted. Uploaded Firestore LLD: `owners/{owner_key}/playspaces/{playspace_id}` with `in_flight_job_id`, worker `attempt`, and `lease_expires_at`.

## Scope to implement
1. Implement `reservePlayspaceRun(ownerKey, playspaceId, reservedJobId)` using a Firestore transaction. Require already validated identity, ownership, and canonical Run request. Use **NJS-05's same transaction** to reserve the idempotency record and active job lock.
2. If `in_flight_job_id` refers to a different nonterminal job, return a safe busy result (proposed 409). If it refers to the **same** idempotent reserved job, treat it as a replay; do not reject it as a new submission.
3. Provide a **fenced** compare-and-set release function that only clears the lock when the completing authorized job ID still matches; on retries, also check current attempt/generation where that field is owned by runtime. Never allow browser requests to release locks.
4. Crucial distinction: BFF admission lock spans the **logical job lifetime**. Worker `lease_expires_at` is a per-attempt heartbeat. **An expired worker lease alone must never open admission for a second Run** until terminal state/reconciler confirms release. Avoid automatic TTL deletion of active lock state.
5. Define a typed handoff API for a future worker/reconciler to transition the job to terminal and release safely. Do **not** implement the worker, Scheduler, ADK or BQ reconciler here.
6. Protect against two tabs, double clicks, concurrent Cloud Run instances, and stale release calls. Firestore transactional consistency is required; process-local mutex is insufficient.

## Suggested record shape
```text
owners/{owner_key}/playspaces/{playspace_id}
  in_flight_job_id, admission_state, attempt,
  lease_expires_at, lock_updated_at, adk_session_id, mapping_revision
```
Do not overwrite `adk_session_id` or other fields owned by the future session resolver. Avoid adding arbitrary TTLs to the entire map document.

## Tests to add
- Two parallel different-key Run requests, same Playspace: exactly one accepted.
- Same-key retry is identified as existing job, not busy conflict.
- Two Playspaces for same owner can each admit one job; different owners isolated.
- Expired worker lease without terminal proof still blocks new admission.
- Stale job release cannot release a newer job's lock.
- Firestore transaction retry and partial downstream failure preserve consistency.

## Acceptance / stop conditions
- No in-memory lock reliance and no premature second job admission.
- NJS-05 and NJS-06 share atomic reservation semantics.
- **Out of scope:** runtime heartbeat (15 s), 60-s worker claim, job reconciler, global model concurrency/quota limits.

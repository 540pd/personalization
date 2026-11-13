# PY-02 — Idempotent Skill publish and immutable Registry revisions


> **Claude Code implementation task — approved functional scope.** Work in the existing repository; do not create a parallel application. First inspect `CLAUDE.md`, package config, related routes/services/models/tests, and relevant checked-in architecture docs. Follow `../01_FROZEN_ARCHITECTURE_RULES.md` and `../02_SHARED_CONTRACTS.md` when supplied. Latest November HLD/LLD is authoritative. Implement **only this task**; use typed interfaces/stubs for out-of-scope dependencies. No deploy, no production IAM/data change, no auto-commit/push.
>
> **Final response requirement:** Report (1) what already existed, (2) changed files, (3) precise behavior, (4) tests run and results, (5) follow-on dependencies or decisions. Do not claim tests passed unless run.

## Goal and architectural location

Skills Studio uploads `SKILL.md` through Node BFF; FastAPI validates it, then publishes exactly **one logical immutable revision per accepted idempotent publish request** to Agent Registry. Replays must return the same revision ref where determinable.

## Scope to implement
1. Reuse PY-01 `SkillService` and PY-03 catalog validator. A publish request must identify authenticated owner, logical Skill, exact content bytes/canonical hash, and publish idempotency key. Do not allow publishing to another owner's Skill.
2. Validate UTF-8, content budget and approved tools before any Registry mutation. Compute SHA-256 over an explicitly documented byte representation. Same key + same content/target returns the existing result; same key + different content/target returns conflict.
3. Implement safe, concurrency-aware publish reservation/reconciliation. Registry publish and operational mapping writes are not one cross-system transaction: use **pending → Registry call → published/finalized** with stable key and recoverable state. Never hold a Firestore transaction while calling Registry.
4. Verify whether actual Agent Registry supports server-side idempotency/revision existence lookup. If it doesn't, **do not claim exactly-once side effects**; use a deterministic ref/lookup or explicit pending reconciliation mechanism available in the repo, and document remaining duplicate-revision risk for approval.
5. Store only the Registry resource/revision **reference**, content hash and ownership metadata in operational store. Do **not** write another published `SKILL.md`, revision blob or parallel version history to GCS.
6. Make the new revision available only after Registry confirms publication; immutable prior versions remain available for already pinned Runs. Return sanitized response with revision ref and status.
7. Support rejected catalog items with 422 and details safe for UI. Never mutate the currently pinned revision when publish fails.

## Tests to add
- First valid publish succeeds and yields immutable revision reference.
- Same idempotency key + same content returns same reference.
- Same key + changed content or target Skill -> 409.
- Two concurrent identical publish attempts avoid duplicate logical publish.
- Registry timeout/unknown response remains `pending` or safely reconciled; no blind duplicate revision call.
- Invalid/unknown MCP tool -> 422 before publishing; no side effects.
- Existing pinned revisions do not change when later content is published.

## Acceptance / stop conditions
- At least-once request delivery is safe, and duplicate uncertainty is explicitly surfaced.
- The canonical record of published Skill revisions is **Agent Registry only**.
- **Out of scope:** runtime execution, creating/updating MCP servers, unapproved draft persistence decisions.

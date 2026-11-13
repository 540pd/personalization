# PY-01 — FastAPI logical Skills CRUD with Agent Registry


> **Claude Code implementation task — approved functional scope.** Work in the existing repository; do not create a parallel application. First inspect `CLAUDE.md`, package config, related routes/services/models/tests, and relevant checked-in architecture docs. Follow `../01_FROZEN_ARCHITECTURE_RULES.md` and `../02_SHARED_CONTRACTS.md` when supplied. Latest November HLD/LLD is authoritative. Implement **only this task**; use typed interfaces/stubs for out-of-scope dependencies. No deploy, no production IAM/data change, no auto-commit/push.
>
> **Final response requirement:** Report (1) what already existed, (2) changed files, (3) precise behavior, (4) tests run and results, (5) follow-on dependencies or decisions. Do not claim tests passed unless run.

## Goal and architectural location

FastAPI exposes **direct synchronous** Skill management APIs for BFF/Skills Studio. Google **Agent Registry** is the source of truth for **published Skill content and immutable revisions**. Logical Skill ownership/indexing is a lightweight reference layer, not another content version store.

## Scope to implement
1. Inspect FastAPI routers, ADK/Registry adapters, auth dependencies, and current data models. Define a typed `SkillService` with logical create/list/get/update/archive behavior appropriate to the **existing** project. Wire routes behind **verified BFF service identity**; `owner_key` is accepted only from authenticated Node BFF, not untrusted public clients.
2. Separate **logical Skill** metadata (`skill_id`, owner key, display name, current revision ref, status, timestamps) from immutable **published revisions** held exclusively by Agent Registry. New content after publishing must create a new Registry revision, never overwrite an old one.
3. Keep public operation semantics honest: CRUD may mean create/update **unpublished draft** and list/get/archive logical Skill. Hard delete of a published revision is **not** assumed; prefer archive/unassign unless explicitly approved.
4. Validate `SKILL.md` syntax, UTF-8 and size (prior cap 100 KiB per Skill) and call PY-03 approved-tool validator before any publish. Enforce owner-scoped list/get/update, preventing cross-user reads and edits.
5. Use an **adapter** to resolve/publish Agent Registry resources; check current SDK/API support and catch provider failures. Do not implement invented Agent Registry methods. If draft persistence or owner-map storage is not settled in code, implement safe domain interfaces/test fakes and identify the exact approval needed.
6. Add pagination and bounded reads, sanitized structured errors, safe audit IDs, and no logging of entire Skill source.

## Suggested contract shapes (use existing route names if available)
```json
{ "skill_id": "skill_...", "display_name": "Product Editorial", "status": "draft", "registry_revision_ref": null }
```
```json
{ "skill_id": "skill_...", "status": "published", "registry_revision_ref": "registry/.../revision/...", "content_sha256": "..." }
```
Do not expose internal owner key publicly or copy published SKILL.md into GCS.

## Tests to add
- Authorized owner can create/list/get own Skill; another owner cannot.
- Invalid Markdown, oversize Skill, unknown tool (via PY-03) rejects.
- Published content is retrieved from Registry, never a mirrored GCS revision.
- Updating published Skill does not mutate immutable revision.
- Archive hides/disables logical Skill without deleting other users' revisions.
- Registry outage returns safe retryable dependency error.

## Acceptance / stop conditions
- Typed service/router + Registry adapter + tests; no duplicate publication logic (PY-02 owns publish).
- **Out of scope:** Agent execution, runtime MCP calls, agent deployment, unapproved draft store, frontend UI.

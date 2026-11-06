# PY-03 — Approved MCP and tool catalog validator


> **Claude Code implementation task — approved functional scope.** Work in the existing repository; do not create a parallel application. First inspect `CLAUDE.md`, package config, related routes/services/models/tests, and relevant checked-in architecture docs. Follow `../01_FROZEN_ARCHITECTURE_RULES.md` and `../02_SHARED_CONTRACTS.md` when supplied. Latest November HLD/LLD is authoritative. Implement **only this task**; use typed interfaces/stubs for out-of-scope dependencies. No deploy, no production IAM/data change, no auto-commit/push.
>
> **Final response requirement:** Report (1) what already existed, (2) changed files, (3) precise behavior, (4) tests run and results, (5) follow-on dependencies or decisions. Do not claim tests passed unless run.

## Goal and architectural location

FastAPI checks every Skill's tool/MCP dependencies against the **approved catalog** referenced by the current architecture (Agent Registry / approved MCP catalog). Unknown or unauthorized tools must be rejected **before** publication. The validator itself must not execute tools.

## Scope to implement
1. Locate existing Registry catalog representation and any current Skill Markdown parser. Define typed catalog entries and a versioned `CatalogProvider` adapter; derive allowed names, endpoint identities, versions, and declared parameter schemas from **approved source**, not from author-supplied Markdown.
2. Parse/normalize the submitted Skill's declared MCP servers/tool references as far as the project's SKILL.md schema supports. Avoid brittle regex-only checks if a structured parser exists. Reject malformed declarations, references to unapproved tools, unexpected endpoint URLs/hosts, and version mismatch when the catalog pins a version.
3. Validate required tool arguments against approved input schemas **if the schema is available**. Do not accept wildcards or caller-provided catalogs. Be explicit whether absence of tool declarations is valid for a tool-free Skill.
4. Return structured validation result with error locations, helpful UI-safe messages, and catalog version/ref. Catalog lookup failure is an upstream error, **not** a fallback that allows everything.
5. Reuse the same validator in PY-01 CRUD, PY-02 publish and PY-04 draft helper. Implement as a pure/domain module with mockable provider; avoid hidden network calls on each validation path if a bounded cache is available, with clear revocation/invalidation semantics.
6. Do not run an MCP call, fetch arbitrary tool URLs, or create Agent Registry tools as part of validation.

## Suggested output
```json
{
  "valid": false,
  "catalog_revision": "approved-catalog-revision",
  "issues": [{ "code": "tool_not_approved", "path": "tools[0]", "message": "Referenced tool is not approved." }]
}
```
Schema naming is illustrative; align it with the repo.

## Tests to add
- Approved tool/version validates and returns catalog ref.
- Tool-free Skill validation policy is explicit and tested.
- Unknown server/tool, unapproved URL, version mismatch -> rejected.
- Missing required declared argument, invalid type -> rejected when schema exists.
- Malformed markdown/tool declaration, duplicate names -> rejected.
- Catalog source down, stale/invalid catalog or unauthorized lookup fails closed.

## Acceptance / stop conditions
- Deterministic, independently testable validator used by all Skills paths.
- **Out of scope:** MCP execution, catalog administration, live remote tool health checks, creating new MCP endpoints.

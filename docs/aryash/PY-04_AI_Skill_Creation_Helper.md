# PY-04 — AI-assisted SKILL.md draft helper (review before publish)


> **Claude Code implementation task — approved functional scope.** Work in the existing repository; do not create a parallel application. First inspect `CLAUDE.md`, package config, related routes/services/models/tests, and relevant checked-in architecture docs. Follow `../01_FROZEN_ARCHITECTURE_RULES.md` and `../02_SHARED_CONTRACTS.md` when supplied. Latest November HLD/LLD is authoritative. Implement **only this task**; use typed interfaces/stubs for out-of-scope dependencies. No deploy, no production IAM/data change, no auto-commit/push.
>
> **Final response requirement:** Report (1) what already existed, (2) changed files, (3) precise behavior, (4) tests run and results, (5) follow-on dependencies or decisions. Do not claim tests passed unless run.

## Goal and architectural location

Skills Studio can describe the intended reusable instruction and ask FastAPI to draft a `SKILL.md` with Gemini/Vertex AI. This is a **direct synchronous helper** for **draft creation only**; it does not publish, execute tools or modify Registry until the user explicitly reviews and submits through PY-02.

## Scope to implement
1. Inspect the existing Vertex AI/Gemini client, prompt helpers, guardrails, and Skills routes. Add a typed helper endpoint/service restricted to authenticated BFF service caller and the session-derived owner key.
2. Accept clear bounded fields: desired Skill purpose, intended behavior, input/output expectations, optional brand constraints and permitted tool selection. Validate types and max lengths. Never accept a raw arbitrary endpoint, user-supplied system instruction, unapproved tool catalog or alternate model credentials.
3. Compose a stable server-owned instruction template requiring a structured, human-reviewable `SKILL.md` draft. The helper should describe purpose, scope, trigger/use-case, inputs, restrictions and output behavior. The model's output is untrusted data: parse it, impose size/format limits and run PY-03 approved catalog validation.
4. Show validation issues instead of silently replacing the user's request with unsafe new tool references. If model output contains unknown tools, return draft + issues (or reject under existing API convention); **do not publish**.
5. Bound latency, retries, model-call count and generated content; reuse central model configuration. Exact Gemini model, region, pricing, and prompt budget must follow existing config or be raised for approval, not hardcoded from a guess.
6. Keep drafts transient unless an approved draft-storage contract already exists. Registry is authoritative **after publishing**, not a place for unreviewed automatically published output. Do not persist prompts, uploaded reference images or private brand material in logs.
7. Isolate an `LLMClient` interface so unit tests use deterministic fake responses; support structured error mapping on model unavailable, invalid JSON/Markdown and unsafe instruction requests.

## Suggested response (not frozen route naming)
```json
{
  "skill_markdown": "---\nname: Product Editorial\n---\n...",
  "is_published": false,
  "validation": { "valid": true, "issues": [] }
}
```

## Tests to add
- Valid description returns parseable draft and `is_published=false`.
- Empty/oversized prompt or invalid input fields fail before model call.
- Model response containing unapproved tool fails PY-03 validation.
- Model timeout/malformed response returns sanitized error; no partial publish.
- No Registry publish/write is invoked by helper path.
- No secret prompts, ID tokens or raw model output printed to logs.

## Acceptance / stop conditions
- UI-ready editable Skill draft, properly validated and **never auto-published**.
- **Out of scope:** Registry publish (PY-02), automatic MCP invocation, skill execution, production model/IAM activation without approval.

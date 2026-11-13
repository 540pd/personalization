# NJS-07 — Ownership, asset, Skill and lineage admission verifier


> **Claude Code implementation task — approved functional scope.** Work in the existing repository; do not create a parallel application. First inspect `CLAUDE.md`, package config, related routes/services/models/tests, and relevant checked-in architecture docs. Follow `../01_FROZEN_ARCHITECTURE_RULES.md` and `../02_SHARED_CONTRACTS.md` when supplied. Latest November HLD/LLD is authoritative. Implement **only this task**; use typed interfaces/stubs for out-of-scope dependencies. No deploy, no production IAM/data change, no auto-commit/push.
>
> **Final response requirement:** Report (1) what already existed, (2) changed files, (3) precise behavior, (4) tests run and results, (5) follow-on dependencies or decisions. Do not claim tests passed unless run.

## Goal and architectural location

Before a Run request reaches FastAPI, the Node BFF must prove that all referenced resources are authorized for the **session-derived owner** and valid for the requested Playspace/DAG operation. Reject forged asset IDs, cross-user parent jobs, and arbitrary storage paths.

## Scope to implement
1. Normalize and validate the incoming Run envelope (Playspace ID, node ID, mode, requested count, parent job IDs, asset IDs, selected immutable Skill revision refs). Enforce configured max counts and type/length rules without trusting client-supplied `owner_key`.
2. Check Playspace ownership in Firestore `owners/{owner_key}/playspaces/{playspace_id}` (or repository equivalent); if first-visit creation is handled elsewhere, use an ownership-aware interface and do not invent a public creation route.
3. Check each asset is owned by principal and in a usable `ready` state. Resolve internally authorized asset ID → GCS path; reject raw or traversal paths from the browser. File format/size limits should be applied at asset ingest and cross-checked when needed, not inferred from filenames.
4. Check selected Skill logical ownership/usage permissions and immutable Agent Registry revision references through the approved mapping/Registry adapter. Do not rely on Skill name strings or arbitrary URLs.
5. Check each parent job belongs to the same owner + Playspace, is an allowed finalized state and is eligible as DAG input. Detect self-reference, duplicate edges, trivial cycles, missing parents and unsupported mode transitions. Leave full multi-agent DAG assembly and execution to future FastAPI dispatcher.
6. For `re-run`/`refine`, validate provenance according to established project rule: re-run can source parent outputs, refine can source own prior output; only authorized, completed outputs are eligible. If current repo behavior differs, report it instead of silently choosing a new policy.
7. Return a typed `AuthorizedRunContext` consumed by NJS-05/06 and NJS-08. Ensure denial responses do not disclose whether another user's resources exist.

## Tests to add
- Authorized owner uses ready assets and allowed parent jobs.
- Cross-owner Playspace, asset, Skill revision or parent job is rejected.
- Unready/missing asset, raw GCS URI, invalid parent state and duplicate parent are rejected.
- Self-cycle and unauthorized re-run/refine provenance are rejected.
- Over-limit image/Skill references and malformed node IDs are rejected.
- Verify no browser-provided owner field can change authorization result.

## Acceptance / stop conditions
- A single admission verifier yields an explicit allowed/denied result before the service call.
- No arbitrary GCS paths, Registry refs, or cross-owner metadata escape into the execution manifest.
- **Out of scope:** global DAG topological sorter, GCS manifest generation, image-edit planner, asset upload implementation.

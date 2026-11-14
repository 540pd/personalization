# GCOS personalization — issue plan, priority and open asks

_Generated 2026-10-26 from `docs/GCOS_Final_Unified_GCS_Only_Architecture_Integration_Plan_v2_10_.md` (v2.10) and the filed GitHub issues. Tracking issue: #351. Issues #352–#402._

## How to read this
- **Wave** = the earliest point an issue can start: wave 0 has no dependencies; wave N needs something from wave N−1. Issues in the same wave can run in parallel.
- **Milestone** = the first milestone that needs the issue. Work on M1 before M2, and so on. `later` means no milestone up to M4 needs it.
- **Depends on** = hard merge prerequisites from plan §9.0. **Blocks** = issues waiting on it.
- **Asks** = the open questions in each issue's "Questions and decisions for the team" checklist. Every issue also needs a named owner.

## Milestones
An issue belongs to the first milestone that needs it: as a dependency, as the other half of a live gate (e.g. PY-05 with NJS-06), or, for the NJS-01/PY-01 inventories, as the plan's G0 gate.

| Milestone | Goal | Target issue | Issues in this milestone |
|---|---|---|---|
| **M1** | First real image (CLI smoke, count=1) | #369 `NJS-LIVE-01` | 15 |
| **M2** | First canvas demo (1/3/10 images on the canvas, local) | #373 `FE-SMOKE-01` | 6 |
| **M3** | Full Create Image: references, Skills, model settings | #389 `NJS-10` | 8 |
| **M4** | Staging release (all gates T01–T49) | #401 `NJS-15` | 16 |

## Team-wide decisions (tracking issue #351)
- [ ] **Named owners (Decision 10):** integration DRI (Node lead), Python co-approver, security/IAM approver, product UI approver, QA evidence owner.
- [ ] **Python repo:** PY-* issues are filed here because the Python repo isn't visible from this account. Move them or keep one tracker?
- [ ] **Conflict with #327:** #320–#326 and #333–#336 plan Firestore and cookie-based identity; v2.10 is GCS-only with Bearer-fetched images. Which plan wins?
- [ ] **Commit the plan doc** so § references in the issues resolve on GitHub.
- [ ] **Retention:** browser-only boards lose images after 30 days unused (`410 asset_expired`, §22.3). Accept?
- [ ] **Feature flag:** name, default, how the frontend learns it.
- [ ] **GCP inputs (§10.1):** project, region, dev bucket, approved Vertex model, Cloud Tasks queue, service accounts.
- [ ] **Roadmap fit** of `gcos:p0`–`gcos:p5` against the image roadmap (`phase-1`…`phase-100`).
- [ ] **Proposed splits:** FE-SMOKE-01 (#373), LOCAL-ASYNC-01 (#372), NJS-10 (#389).
- [ ] **No frontend owner yet:** reference upload UI (#374), local Skills → server (#378), Agents on server (#385), retry a failed image (#395), answering a clarification (#383).

## Priority order

| Priority | # | Plan ID | Title | Team | Phase | Wave | Milestone | Depends on | Blocks | Asks |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | #352 | `NJS-01` | Code inventory and integration ownership map | node | P0 | 0 | M1 | none | #398 | 3 |
| 2 | #353 | `PY-01` | Review Python runtime, Campaign dependencies and reusable Vertex components | python | P0 | 0 | M1 | none | #399 | 3 |
| 3 | #354 | `SH-01` | Publish one versioned shared contract and cross-repo fixtures | node, python | P0 | 0 | M1 | none | #356, #357 | 3 |
| 4 | #355 | `GCS-01` | Provision private GCS buckets, IAM and retention policy | node, python, cloud | P0 | 0 | M1 | none | #364, #367, #376, #391 | 4 |
| 5 | #361 | `NJS-04A` | Introduce stable verified user subject and secret-backed owner key | node | P1 | 0 | M1 | none | #367 | 5 |
| 6 | #356 | `NJS-02` | Define TypeScript v1 contract, handwritten validation and fixtures | node | P1 | 1 | M1 | #354 SH-01 | #359, #367, #368 | 3 |
| 7 | #357 | `PY-02` | Implement Pydantic v1 contract matching the shared fixtures | python | P1 | 1 | M1 | #354 SH-01 | #358, #362, #364, #376, #381, #382 | 2 |
| 8 | #358 | `PY-03` | Implement mock FastAPI execution endpoint and non-polling mock response | python | P1 | 2 | M1 | #357 PY-02 | #365 | 2 |
| 9 | #359 | `NJS-03` | Build real and fake Python clients with separate async/direct timeouts | node | P1 | 2 | M1 | #356 NJS-02 | #360 | 3 |
| 10 | #362 | `PY-04` | Create campaign-independent Python execution context | python | P1 | 2 | M1 | #357 PY-02 | #365, #383 | 2 |
| 11 | #364 | `PY-OUTPUT-01` | Save real images to reserved GCS output slots with checksums | python | P2 | 2 | M1 | #355 GCS-01, #357 PY-02 | #365 | 2 |
| 12 | #367 | `GCS-02A` | Implement minimal GCS CAS, reservations, asset manifests and seven-day idempotency | node | P2 | 2 | M1 | #355 GCS-01, #356 NJS-02, #361 NJS-04A | #368, #369, #371, #374, #377, #378, #386, #397 | 2 |
| 13 | #360 | `NJS-04` | Create feature-flagged authenticated personalization submission API | node | P1 | 3 | M1 | #359 NJS-03 | #369, #372, #390 | 2 |
| 14 | #365 | `PY-LIVE-01` | Implement standalone direct Vertex create-image smoke endpoint | python | P2 | 3 | M1 | #358 PY-03, #362 PY-04, #364 PY-OUTPUT-01 | #366, #369, #399 | 3 |
| 15 | #369 | `NJS-LIVE-01` | Verify local real Node-to-Python image-generation integration | node | P2 | 4 | M1 | #360 NJS-04, #365 PY-LIVE-01, #367 GCS-02A | — | 2 |
| 16 | #370 | `NEW-03-TRANSPORT` | Implement binary-safe Next.js proxy transport independently of security release sign-off | node, frontend | P2 | 0 | M2 | none | #371, #374, #396 | 3 |
| 17 | #368 | `GCS-02B` | Implement async job indexes, private routes, leases and recovery | node | P2 | 3 | M2 | #367 GCS-02A, #356 NJS-02 | #372, #390, #393 | 2 |
| 18 | #371 | `NJS-13-LITE` | Add authenticated output image proxy with owner verification | node | P2 | 3 | M2 | #367 GCS-02A, #370 NEW-03-TRANSPORT | #373, #397 | 2 |
| 19 | #366 | `PY-10` | Implement model capability registry and 1–10 image planning | python | P2 | 4 | M2 | #365 PY-LIVE-01 | #372, #394 | 2 |
| 20 | #372 | `LOCAL-ASYNC-01` | Implement local durable 202 job dispatch and Python callbacks | node, python | P2 | 5 | M2 | #368 GCS-02B, #360 NJS-04, #366 PY-10 | #373, #392, #395 | 3 |
| 21 | #373 | `FE-SMOKE-01` | Connect existing Create Image canvas to async personalization smoke | frontend | P2 | 6 | M2 | #372 LOCAL-ASYNC-01, #371 NJS-13-LITE | #389 | 4 |
| 22 | #376 | `PY-05` | Validate and load Node-authorized reference images in Python | python | P3 | 2 | M3 | #357 PY-02, #355 GCS-01 | — | 1 |
| 23 | #381 | `PY-06` | Verify Skill hashes, applicability and rejection reason codes | python | P4 | 2 | M3 | #357 PY-02 | #384, #388 | 1 |
| 24 | #374 | `NEW-01` | Add private GCS reference-image upload and asset catalog | node | P3 | 3 | M3 | #367 GCS-02A, #370 NEW-03-TRANSPORT | #375 | 2 |
| 25 | #378 | `NJS-07` | Implement immutable GCS-backed Markdown Skills and version pointers | node | P4 | 3 | M3 | #367 GCS-02A | #379, #380, #385 | 3 |
| 26 | #375 | `NJS-06` | Resolve and authorize GCS inputs and reference roles | node | P3 | 4 | M3 | #374 NEW-01 | #389 | 1 |
| 27 | #379 | `FE-02` | Add a verified-design Skill picker to existing Create Image UI | frontend | P4 | 4 | M3 | #378 NJS-07 | #389 | 3 |
| 28 | #380 | `NJS-08` | Resolve and pass authorized versioned Skills to Python | node | P4 | 4 | M3 | #378 NJS-07 | #389 | 1 |
| 29 | #389 | `NJS-10` | Expand Create Image integration to reference images, selected Skills and model controls | node, frontend | P4 | 7 | M3 | #373 FE-SMOKE-01, #375 NJS-06, #380 NJS-08, #379 FE-02 | #401 | 2 |
| 30 | #363 | `NEW-04` | Document and enforce model, Node, Cloud Run and Cloud Tasks deadlines | node, python, cloud | P1 | 0 | M4 | none | #391 | 2 |
| 31 | #391 | `PY-13` | Deploy private authenticated Python Cloud Run worker | python, cloud | P5 | 1 | M4 | #355 GCS-01, #363 NEW-04 | #392, #400 | 2 |
| 32 | #396 | `NEW-03` | Harden deployed proxy identity and infrastructure OIDC (release security gate) | node, frontend, cloud | P5 | 1 | M4 | #370 NEW-03-TRANSPORT | #401 | 3 |
| 33 | #382 | `PY-07` | Enforce independent mandatory Python guardrails | python | P4 | 2 | M4 | #357 PY-02 | #384, #400 | 2 |
| 34 | #383 | `PY-08` | Implement prompt understanding and clarification contract | python | P4 | 3 | M4 | #362 PY-04 | #384, #388 | 2 |
| 35 | #386 | `NJS-09B` | Persist multiple versioned Brand profiles in GCS (includes NEW-05) | node | P4 | 3 | M4 | #367 GCS-02A | #387, #401 | 2 |
| 36 | #384 | `PY-09` | Build a campaign-free final prompt package | python | P4 | 4 | M4 | #381 PY-06, #382 PY-07, #383 PY-08 | #401 | 1 |
| 37 | #387 | `FE-BRAND-01` | Add optional saved Brand selection to Create Image | node, frontend | P4 | 4 | M4 | #386 NJS-09B | #401 | 2 |
| 38 | #390 | `ASYNC-01` | Create durable job reservations and Cloud Tasks dispatch | node | P5 | 4 | M4 | #368 GCS-02B, #360 NJS-04 | #401 | 2 |
| 39 | #393 | `NJS-11` | Record requests, model attempts and verified outputs accurately | node | P5 | 4 | M4 | #368 GCS-02B | #401 | 1 |
| 40 | #397 | `NJS-13` | Expand authorized asset catalog, previews, expiry and deletion | node | P5 | 4 | M4 | #371 NJS-13-LITE, #367 GCS-02A | #401, #402 | 2 |
| 41 | #394 | `PY-12` | Emit real model attempts, outcomes and per-slot retry provenance | python | P5 | 5 | M4 | #366 PY-10 | #401, #400 | 1 |
| 42 | #392 | `ASYNC-02` | Implement Cloud Tasks Python worker, CAS leases and callbacks | node, python | P5 | 6 | M4 | #372 LOCAL-ASYNC-01, #391 PY-13 | #401 | 1 |
| 43 | #395 | `NJS-12` | Implement job statuses, error mapping and explicit failed-slot retry | node | P5 | 6 | M4 | #372 LOCAL-ASYNC-01 | #401 | 2 |
| 44 | #400 | `PY-15` | Publish Python integration runbook and smoke-test evidence | python | P5 | 6 | M4 | #391 PY-13, #394 PY-12, #382 PY-07 | #401 | 1 |
| 45 | #401 | `NJS-15` | Run full staging end-to-end acceptance and rollback | node, frontend | P5 | 8 | M4 | #389 NJS-10, #395 NJS-12, #397 NJS-13, #400 PY-15, #396 NEW-03, #390 ASYNC-01, #392 ASYNC-02, #386 NJS-09B, #387 FE-BRAND-01, #384 PY-09, #393 NJS-11, #394 PY-12 | — | 2 |
| 46 | #398 | `NJS-14` | Remove unused Node Firestore runtime paths safely | node | P5 | 1 | later | #352 NJS-01 | — | 2 |
| 47 | #377 | `NJS-05` | Implement generation sessions using durable GCS CAS snapshots | node | P3 | 3 | later | #367 GCS-02A | — | 2 |
| 48 | #385 | `NJS-09A` | Persist versioned Agents and pinned Skill references in GCS | node | P4 | 4 | later | #378 NJS-07 | — | 2 |
| 49 | #388 | `PY-SKILL-AUTO` | Add later automatic Skill suggestions with Node authorization | node, python | P4 | 4 | later | #381 PY-06, #383 PY-08 | — | 2 |
| 50 | #399 | `PY-14` | Isolate legacy Python Campaign/Firestore paths from new execution | python | P5 | 4 | later | #353 PY-01, #365 PY-LIVE-01 | — | 1 |
| 51 | #402 | `NJS-LEGACY-GCS` | Defer optional legacy Create Image output migration to GCS | node, frontend | P5 | 5 | later | #397 NJS-13 | — | 2 |

## Start now (wave 0, no dependencies)
- #352 `NJS-01` — Code inventory and integration ownership map (node, M1)
- #353 `PY-01` — Review Python runtime, Campaign dependencies and reusable Vertex components (python, M1)
- #354 `SH-01` — Publish one versioned shared contract and cross-repo fixtures (node, python, M1)
- #355 `GCS-01` — Provision private GCS buckets, IAM and retention policy (node, python, cloud, M1)
- #361 `NJS-04A` — Introduce stable verified user subject and secret-backed owner key (node, M1)
- #370 `NEW-03-TRANSPORT` — Implement binary-safe Next.js proxy transport independently of security release sign-off (node, frontend, M2)
- #363 `NEW-04` — Document and enforce model, Node, Cloud Run and Cloud Tasks deadlines (node, python, cloud, M4)

## Issues, dependencies and asks (in priority order)

### 1. #352 `NJS-01` — Code inventory and integration ownership map
- **Team:** node · **Phase:** P0 (Repository truth) · **Wave:** 0 · **Milestone:** M1
- **Depends on:** none
- **Blocks:** #398 NJS-14
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI)
  - [ ] `docs/integration/` is untracked locally and holds the superseded backlog. Should the inventory replace it, or live elsewhere?
  - [ ] The inventory must cover files added since the plan's snapshot: `backend/src/routes/generateRequest.ts`, `references.ts`, `capabilities/models.ts` (#262) and the Library kit (#260).

### 2. #353 `PY-01` — Review Python runtime, Campaign dependencies and reusable Vertex components
- **Team:** python · **Phase:** P0 (Repository truth) · **Wave:** 0 · **Milestone:** M1
- **Depends on:** none
- **Blocks:** #399 PY-14
- **Asks:**
  - [ ] Owner — Decision 10 role: Python lead
  - [ ] Where is the Python repo (`GCOS_backend_personalization_python`)? It isn't visible from this GitHub account, so all PY issues are filed here for now.
  - [ ] Which Python version will devs and Cloud Run use: 3.13 or 3.14 (both inside `requires-python`)?

### 3. #354 `SH-01` — Publish one versioned shared contract and cross-repo fixtures
- **Team:** node, python · **Phase:** P0 (Repository truth) · **Wave:** 0 · **Milestone:** M1
- **Depends on:** none
- **Blocks:** #356 NJS-02, #357 PY-02
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI), Python lead
  - [ ] Confirm the canonical contract lives in this repo at `docs/contracts/generation/v1/`, not a separate shared repo.
  - [ ] How does the Python repo consume the fixtures: copied with a hash manifest, git submodule, or another way?

### 4. #355 `GCS-01` — Provision private GCS buckets, IAM and retention policy
- **Team:** node, python, cloud · **Phase:** P0 (Repository truth) · **Wave:** 0 · **Milestone:** M1
- **Depends on:** none
- **Blocks:** #364 PY-OUTPUT-01, #367 GCS-02A, #376 PY-05, #391 PY-13
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI), Python lead, Cloud/security owner
  - [ ] GCP project ID, region and dev bucket name (plan §10.1 lists what the cloud admin must provide).
  - [ ] Is one private dev bucket with prefixes acceptable to security for now, given it is weaker least-privilege than two buckets?
  - [ ] Retention approval: 7-day dedupe, 90-day key tombstones, 30-day inactivity expiry for inputs and outputs (§6.7).

### 5. #361 `NJS-04A` — Introduce stable verified user subject and secret-backed owner key
- **Team:** node · **Phase:** P1 (Contract and identity) · **Wave:** 0 · **Milestone:** M1
- **Depends on:** none
- **Blocks:** #367 GCS-02A
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI)
  - [ ] Existing 30-day session tokens carry only email. Moving to issuer+sub forces every user to sign in again once. Is that acceptable?
  - [ ] Who creates the `OWNER_KEY_HMAC_V1` secret in Secret Manager, and who may read it?
  - [ ] Is any deployed environment running `AUTH_MODE=anonymous` + `IAP_PROTECTED=true` today? This issue blocks personalization there.
  - [ ] Overlap: #320 ("the session cookie keeps you signed in") also changes session handling. Which issue lands first?

### 6. #356 `NJS-02` — Define TypeScript v1 contract, handwritten validation and fixtures
- **Team:** node · **Phase:** P1 (Contract and identity) · **Wave:** 1 · **Milestone:** M1
- **Depends on:** #354 SH-01
- **Blocks:** #359 NJS-03, #367 GCS-02A, #368 GCS-02B
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI)
  - [ ] Since #262, `/generate/*` share `readGenerateRequest` (`backend/src/routes/generateRequest.ts`) and the model allow-list lives in `backend/src/capabilities/models.ts`. Should the v1 contract reuse that allow-list rather than keep a second list?
  - [ ] Confirm the file name `backend/src/contracts/generationV1.ts` (§2.3 Q4).

### 7. #357 `PY-02` — Implement Pydantic v1 contract matching the shared fixtures
- **Team:** python · **Phase:** P1 (Contract and identity) · **Wave:** 1 · **Milestone:** M1
- **Depends on:** #354 SH-01
- **Blocks:** #358 PY-03, #362 PY-04, #364 PY-OUTPUT-01, #376 PY-05, #381 PY-06, #382 PY-07
- **Asks:**
  - [ ] Owner — Decision 10 role: Python lead
  - [ ] Pydantic version, and how fixtures are pinned in the Python repo (see SH-01).

### 8. #358 `PY-03` — Implement mock FastAPI execution endpoint and non-polling mock response
- **Team:** python · **Phase:** P1 (Contract and identity) · **Wave:** 2 · **Milestone:** M1
- **Depends on:** #357 PY-02
- **Blocks:** #365 PY-LIVE-01
- **Asks:**
  - [ ] Owner — Decision 10 role: Python lead
  - [ ] Agree the local service-token variable names and how devs share them (never committed).

### 9. #359 `NJS-03` — Build real and fake Python clients with separate async/direct timeouts
- **Team:** node · **Phase:** P1 (Contract and identity) · **Wave:** 2 · **Milestone:** M1
- **Depends on:** #356 NJS-02
- **Blocks:** #360 NJS-04
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI)
  - [ ] What is the feature flag called, what is its default, and how does the frontend learn it (e.g. `/api/auth-config`)?
  - [ ] This issue edits CLAUDE.md rule 3 (mock mode). Who approves that wording?

### 10. #362 `PY-04` — Create campaign-independent Python execution context
- **Team:** python · **Phase:** P1 (Contract and identity) · **Wave:** 2 · **Milestone:** M1
- **Depends on:** #357 PY-02
- **Blocks:** #365 PY-LIVE-01, #383 PY-08
- **Asks:**
  - [ ] Owner — Decision 10 role: Python lead
  - [ ] Which existing Campaign routes must keep working unchanged?

### 11. #364 `PY-OUTPUT-01` — Save real images to reserved GCS output slots with checksums
- **Team:** python · **Phase:** P2 (First real image and canvas) · **Wave:** 2 · **Milestone:** M1
- **Depends on:** #355 GCS-01, #357 PY-02
- **Blocks:** #365 PY-LIVE-01
- **Asks:**
  - [ ] Owner — Decision 10 role: Python lead
  - [ ] GCS can't restrict writes by prefix inside one bucket. Does security accept Python having object-create on the whole dev bucket?

### 12. #367 `GCS-02A` — Implement minimal GCS CAS, reservations, asset manifests and seven-day idempotency
- **Team:** node · **Phase:** P2 (First real image and canvas) · **Wave:** 2 · **Milestone:** M1
- **Depends on:** #355 GCS-01, #356 NJS-02, #361 NJS-04A
- **Blocks:** #368 GCS-02B, #369 NJS-LIVE-01, #371 NJS-13-LITE, #374 NEW-01, #377 NJS-05, #378 NJS-07, #386 NJS-09B, #397 NJS-13
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI)
  - [ ] The 90-day idempotency tombstone and 7-day window need retention approval (see GCS-01).

### 13. #360 `NJS-04` — Create feature-flagged authenticated personalization submission API
- **Team:** node · **Phase:** P1 (Contract and identity) · **Wave:** 3 · **Milestone:** M1
- **Depends on:** #359 NJS-03
- **Blocks:** #369 NJS-LIVE-01, #372 LOCAL-ASYNC-01, #390 ASYNC-01
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI)
  - [ ] Confirm the public path `POST /api/personalization/execute` and that flag-OFF should return 404 (route hidden) rather than 403.

### 14. #365 `PY-LIVE-01` — Implement standalone direct Vertex create-image smoke endpoint
- **Team:** python · **Phase:** P2 (First real image and canvas) · **Wave:** 3 · **Milestone:** M1
- **Depends on:** #358 PY-03, #362 PY-04, #364 PY-OUTPUT-01
- **Blocks:** #366 PY-10, #369 NJS-LIVE-01, #399 PY-14
- **Asks:**
  - [ ] Owner — Decision 10 role: Python lead
  - [ ] Which Vertex image model ID and region are approved and enabled for the live smoke?
  - [ ] Who approves the cost/quota for live smoke runs?

### 15. #369 `NJS-LIVE-01` — Verify local real Node-to-Python image-generation integration
- **Team:** node · **Phase:** P2 (First real image and canvas) · **Wave:** 4 · **Milestone:** M1
- **Depends on:** #360 NJS-04, #365 PY-LIVE-01, #367 GCS-02A
- **Blocks:** nothing
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI)
  - [ ] Who runs the live smoke, and with which local Google credentials (ADC) and project?

### 16. #370 `NEW-03-TRANSPORT` — Implement binary-safe Next.js proxy transport independently of security release sign-off
- **Team:** node, frontend · **Phase:** P2 (First real image and canvas) · **Wave:** 0 · **Milestone:** M2
- **Depends on:** none
- **Blocks:** #371 NJS-13-LITE, #374 NEW-01, #396 NEW-03
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI), Frontend lead
  - [ ] The repo has no proxy route tests yet (checked at `3983366`), so this issue adds the first. Is Vitest calling the route handler with a mocked `fetch` acceptable?
  - [ ] Should the proxy enforce its own 10 MiB upload cap, or leave it to the backend route?

### 17. #368 `GCS-02B` — Implement async job indexes, private routes, leases and recovery
- **Team:** node · **Phase:** P2 (First real image and canvas) · **Wave:** 3 · **Milestone:** M2
- **Depends on:** #367 GCS-02A, #356 NJS-02
- **Blocks:** #372 LOCAL-ASYNC-01, #390 ASYNC-01, #393 NJS-11
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI)
  - [ ] How is the pending-index scanner triggered locally (interval in the dispatcher?) and in cloud (Cloud Scheduler?), and who provisions it?

### 18. #371 `NJS-13-LITE` — Add authenticated output image proxy with owner verification
- **Team:** node · **Phase:** P2 (First real image and canvas) · **Wave:** 3 · **Milestone:** M2
- **Depends on:** #367 GCS-02A, #370 NEW-03-TRANSPORT
- **Blocks:** #373 FE-SMOKE-01, #397 NJS-13
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI)
  - [ ] Cache policy for image responses (e.g. `private, max-age=…`)?

### 19. #366 `PY-10` — Implement model capability registry and 1–10 image planning
- **Team:** python · **Phase:** P2 (First real image and canvas) · **Wave:** 4 · **Milestone:** M2
- **Depends on:** #365 PY-LIVE-01
- **Blocks:** #372 LOCAL-ASYNC-01, #394 PY-12
- **Live gate also needs:** #373 FE-SMOKE-01 (1/3/10 image results)
- **Asks:**
  - [ ] Owner — Decision 10 role: Python lead
  - [ ] Who owns the model list? Node has `backend/src/capabilities/models.ts`. How does the Python capability registry stay in sync with it?

### 20. #372 `LOCAL-ASYNC-01` — Implement local durable 202 job dispatch and Python callbacks
- **Team:** node, python · **Phase:** P2 (First real image and canvas) · **Wave:** 5 · **Milestone:** M2
- **Depends on:** #368 GCS-02B, #360 NJS-04, #366 PY-10
- **Blocks:** #373 FE-SMOKE-01, #392 ASYNC-02, #395 NJS-12
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI), Python lead
  - [ ] Owner is "Node + Python" and the work spans both repos. Split into a Node issue and a Python issue?
  - [ ] How does the local dispatcher start on Windows: an npm script in `backend/`?

### 21. #373 `FE-SMOKE-01` — Connect existing Create Image canvas to async personalization smoke
- **Team:** frontend · **Phase:** P2 (First real image and canvas) · **Wave:** 6 · **Milestone:** M2
- **Depends on:** #372 LOCAL-ASYNC-01, #371 NJS-13-LITE
- **Blocks:** #389 NJS-10
- **Live gate also needs:** #366 PY-10 (1/3/10 image results)
- **Asks:**
  - [ ] Owner — Decision 10 role: Frontend lead
  - [ ] Scope is large (new canvas storage format, image fetcher, reload recovery, drag/download/undo, legacy conversion). CLAUDE.md says one feature per issue. Split into (a) storage format + fetcher + reload recovery and (b) canvas interactions + legacy conversion?
  - [ ] Product: images on browser-only boards expire after 30 days unused (§22.3). What should the 410 "asset expired" state say and offer?
  - [ ] Which Luma screen states apply to pending/partial/clarification on a node (OBJ-01)?

### 22. #376 `PY-05` — Validate and load Node-authorized reference images in Python
- **Team:** python · **Phase:** P3 (Input assets and sessions) · **Wave:** 2 · **Milestone:** M3
- **Depends on:** #357 PY-02, #355 GCS-01
- **Blocks:** nothing
- **Live gate also needs:** #375 NJS-06 (real reference-image E2E)
- **Asks:**
  - [ ] Owner — Decision 10 role: Python lead

### 23. #381 `PY-06` — Verify Skill hashes, applicability and rejection reason codes
- **Team:** python · **Phase:** P4 (Skills, guardrails, Agents, Brands) · **Wave:** 2 · **Milestone:** M3
- **Depends on:** #357 PY-02
- **Blocks:** #384 PY-09, #388 PY-SKILL-AUTO
- **Live gate also needs:** #379 FE-02 (selected Skills); #380 NJS-08 (selected Skills)
- **Asks:**
  - [ ] Owner — Decision 10 role: Python lead

### 24. #374 `NEW-01` — Add private GCS reference-image upload and asset catalog
- **Team:** node · **Phase:** P3 (Input assets and sessions) · **Wave:** 3 · **Milestone:** M3
- **Depends on:** #367 GCS-02A, #370 NEW-03-TRANSPORT
- **Blocks:** #375 NJS-06
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI)
  - [ ] Where does the user upload a reference image in the UI? Dropping on the canvas (`board/upload.ts`) or only on first use as a reference? No frontend issue owns this yet.

### 25. #378 `NJS-07` — Implement immutable GCS-backed Markdown Skills and version pointers
- **Team:** node · **Phase:** P4 (Skills, guardrails, Agents, Brands) · **Wave:** 3 · **Milestone:** M3
- **Depends on:** #367 GCS-02A
- **Blocks:** #379 FE-02, #380 NJS-08, #385 NJS-09A
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI)
  - [ ] Skills are now in localStorage via the Library kit (#260). How do existing local Skills move to the server (import on first use, or a bulk import button)? No frontend issue owns this yet.
  - [ ] #327 lists "moving skills/agents/settings to the server" as not planned. Does this plan supersede that?

### 26. #375 `NJS-06` — Resolve and authorize GCS inputs and reference roles
- **Team:** node · **Phase:** P3 (Input assets and sessions) · **Wave:** 4 · **Milestone:** M3
- **Depends on:** #374 NEW-01
- **Blocks:** #389 NJS-10
- **Live gate also needs:** #376 PY-05 (real reference-image E2E)
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI)

### 27. #379 `FE-02` — Add a verified-design Skill picker to existing Create Image UI
- **Team:** frontend · **Phase:** P4 (Skills, guardrails, Agents, Brands) · **Wave:** 4 · **Milestone:** M3
- **Depends on:** #378 NJS-07
- **Blocks:** #389 NJS-10
- **Live gate also needs:** #381 PY-06 (selected Skills)
- **Asks:**
  - [ ] Owner — Decision 10 role: Frontend lead
  - [ ] Who does the Luma comparison for the Skill picker (IMG-02/IMG-03/SKILL-01), and when?
  - [ ] When an @skill mention is ambiguous (two Skills with the same name), what does the user see?

### 28. #380 `NJS-08` — Resolve and pass authorized versioned Skills to Python
- **Team:** node · **Phase:** P4 (Skills, guardrails, Agents, Brands) · **Wave:** 4 · **Milestone:** M3
- **Depends on:** #378 NJS-07
- **Blocks:** #389 NJS-10
- **Live gate also needs:** #381 PY-06 (selected Skills)
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI)

### 29. #389 `NJS-10` — Expand Create Image integration to reference images, selected Skills and model controls
- **Team:** node, frontend · **Phase:** P4 (Skills, guardrails, Agents, Brands) · **Wave:** 7 · **Milestone:** M3
- **Depends on:** #373 FE-SMOKE-01, #375 NJS-06, #380 NJS-08, #379 FE-02
- **Blocks:** #401 NJS-15
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI), Frontend lead
  - [ ] Owner is "Node + Frontend". Split into a Node payload issue and a frontend issue?

### 30. #363 `NEW-04` — Document and enforce model, Node, Cloud Run and Cloud Tasks deadlines
- **Team:** node, python, cloud · **Phase:** P1 (Contract and identity) · **Wave:** 0 · **Milestone:** M4
- **Depends on:** none
- **Blocks:** #391 PY-13
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI), Python lead, Cloud/security owner
  - [ ] Current Cloud Run request timeouts for Node and Python, and the Cloud Tasks dispatch deadline to use.

### 31. #391 `PY-13` — Deploy private authenticated Python Cloud Run worker
- **Team:** python, cloud · **Phase:** P5 (Async, security, handoff) · **Wave:** 1 · **Milestone:** M4
- **Depends on:** #355 GCS-01, #363 NEW-04
- **Blocks:** #392 ASYNC-02, #400 PY-15
- **Live gate also needs:** #390 ASYNC-01 (deployed worker security); #392 ASYNC-02 (deployed worker security)
- **Asks:**
  - [ ] Owner — Decision 10 role: Python lead, Cloud/security owner
  - [ ] Cloud Run service name, region and service account for the Python worker.

### 32. #396 `NEW-03` — Harden deployed proxy identity and infrastructure OIDC (release security gate)
- **Team:** node, frontend, cloud · **Phase:** P5 (Async, security, handoff) · **Wave:** 1 · **Milestone:** M4
- **Depends on:** #370 NEW-03-TRANSPORT
- **Blocks:** #401 NJS-15
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI), Frontend lead, Cloud/security owner
  - [ ] Who is the security approver?
  - [ ] The unlanded `feat/iap-access-gate` spec also touches IAP. Does it interact with this issue?

### 33. #382 `PY-07` — Enforce independent mandatory Python guardrails
- **Team:** python · **Phase:** P4 (Skills, guardrails, Agents, Brands) · **Wave:** 2 · **Milestone:** M4
- **Depends on:** #357 PY-02
- **Blocks:** #384 PY-09, #400 PY-15
- **Asks:**
  - [ ] Owner — Decision 10 role: Python lead
  - [ ] Who supplies the mandatory guardrail policy text, and where is it versioned?

### 34. #383 `PY-08` — Implement prompt understanding and clarification contract
- **Team:** python · **Phase:** P4 (Skills, guardrails, Agents, Brands) · **Wave:** 3 · **Milestone:** M4
- **Depends on:** #362 PY-04
- **Blocks:** #384 PY-09, #388 PY-SKILL-AUTO
- **Asks:**
  - [ ] Owner — Decision 10 role: Python lead
  - [ ] Which frontend issue renders the clarification question on the node? FE-SMOKE-01 lists the state, but not the answer flow (new linked submission).

### 35. #386 `NJS-09B` — Persist multiple versioned Brand profiles in GCS (includes NEW-05)
- **Team:** node · **Phase:** P4 (Skills, guardrails, Agents, Brands) · **Wave:** 3 · **Milestone:** M4
- **Depends on:** #367 GCS-02A
- **Blocks:** #387 FE-BRAND-01, #401 NJS-15
- **Live gate also needs:** #384 PY-09 (selected Brand)
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI)
  - [ ] Brand images require NEW-01. Should text-only Brand profiles ship first?

### 36. #384 `PY-09` — Build a campaign-free final prompt package
- **Team:** python · **Phase:** P4 (Skills, guardrails, Agents, Brands) · **Wave:** 4 · **Milestone:** M4
- **Depends on:** #381 PY-06, #382 PY-07, #383 PY-08
- **Blocks:** #401 NJS-15
- **Live gate also needs:** #387 FE-BRAND-01 (selected Brand); #386 NJS-09B (selected Brand)
- **Asks:**
  - [ ] Owner — Decision 10 role: Python lead

### 37. #387 `FE-BRAND-01` — Add optional saved Brand selection to Create Image
- **Team:** node, frontend · **Phase:** P4 (Skills, guardrails, Agents, Brands) · **Wave:** 4 · **Milestone:** M4
- **Depends on:** #386 NJS-09B
- **Blocks:** #401 NJS-15
- **Live gate also needs:** #384 PY-09 (selected Brand)
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI), Frontend lead
  - [ ] There is no Luma screen ID for Brand in CLAUDE.md. Which screen should the picker follow?

### 38. #390 `ASYNC-01` — Create durable job reservations and Cloud Tasks dispatch
- **Team:** node · **Phase:** P5 (Async, security, handoff) · **Wave:** 4 · **Milestone:** M4
- **Depends on:** #368 GCS-02B, #360 NJS-04
- **Blocks:** #401 NJS-15
- **Live gate also needs:** #392 ASYNC-02 (deployed worker security); #395 NJS-12 (deployed retry dispatch); #391 PY-13 (deployed worker security)
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI)
  - [ ] Cloud Tasks queue name, region and rate limits. Who provisions it?

### 39. #393 `NJS-11` — Record requests, model attempts and verified outputs accurately
- **Team:** node · **Phase:** P5 (Async, security, handoff) · **Wave:** 4 · **Milestone:** M4
- **Depends on:** #368 GCS-02B
- **Blocks:** #401 NJS-15
- **Live gate also needs:** #394 PY-12 (real accounting events)
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI)

### 40. #397 `NJS-13` — Expand authorized asset catalog, previews, expiry and deletion
- **Team:** node · **Phase:** P5 (Async, security, handoff) · **Wave:** 4 · **Milestone:** M4
- **Depends on:** #371 NJS-13-LITE, #367 GCS-02A
- **Blocks:** #401 NJS-15, #402 NJS-LEGACY-GCS
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI)
  - [ ] Deletion stays off until retention/security approval. Who gives that approval?

### 41. #394 `PY-12` — Emit real model attempts, outcomes and per-slot retry provenance
- **Team:** python · **Phase:** P5 (Async, security, handoff) · **Wave:** 5 · **Milestone:** M4
- **Depends on:** #366 PY-10
- **Blocks:** #401 NJS-15, #400 PY-15
- **Live gate also needs:** #393 NJS-11 (real accounting events)
- **Asks:**
  - [ ] Owner — Decision 10 role: Python lead

### 42. #392 `ASYNC-02` — Implement Cloud Tasks Python worker, CAS leases and callbacks
- **Team:** node, python · **Phase:** P5 (Async, security, handoff) · **Wave:** 6 · **Milestone:** M4
- **Depends on:** #372 LOCAL-ASYNC-01, #391 PY-13
- **Blocks:** #401 NJS-15
- **Live gate also needs:** #390 ASYNC-01 (deployed worker security); #391 PY-13 (deployed worker security)
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI), Python lead

### 43. #395 `NJS-12` — Implement job statuses, error mapping and explicit failed-slot retry
- **Team:** node · **Phase:** P5 (Async, security, handoff) · **Wave:** 6 · **Milestone:** M4
- **Depends on:** #372 LOCAL-ASYNC-01
- **Blocks:** #401 NJS-15
- **Live gate also needs:** #390 ASYNC-01 (deployed retry dispatch)
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI)
  - [ ] Which frontend issue adds the "retry this image" action on a failed slot? None owns it yet.

### 44. #400 `PY-15` — Publish Python integration runbook and smoke-test evidence
- **Team:** python · **Phase:** P5 (Async, security, handoff) · **Wave:** 6 · **Milestone:** M4
- **Depends on:** #391 PY-13, #394 PY-12, #382 PY-07
- **Blocks:** #401 NJS-15
- **Asks:**
  - [ ] Owner — Decision 10 role: Python lead

### 45. #401 `NJS-15` — Run full staging end-to-end acceptance and rollback
- **Team:** node, frontend · **Phase:** P5 (Async, security, handoff) · **Wave:** 8 · **Milestone:** M4
- **Depends on:** #389 NJS-10, #395 NJS-12, #397 NJS-13, #400 PY-15, #396 NEW-03, #390 ASYNC-01, #392 ASYNC-02, #386 NJS-09B, #387 FE-BRAND-01, #384 PY-09, #393 NJS-11, #394 PY-12
- **Blocks:** nothing
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI), Frontend lead
  - [ ] Does a staging environment exist? Who signs gates G1–G6?

### 46. #398 `NJS-14` — Remove unused Node Firestore runtime paths safely
- **Team:** node · **Phase:** P5 (Async, security, handoff) · **Wave:** 1 · **Milestone:** later
- **Depends on:** #352 NJS-01
- **Blocks:** nothing
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI)
  - [ ] Conflict: #322, #324 and #325 plan Firestore for boards and jobs, while v2.10 is GCS-only and removes Firestore. Which plan wins? (Those issues are untouched.)

### 47. #377 `NJS-05` — Implement generation sessions using durable GCS CAS snapshots
- **Team:** node · **Phase:** P3 (Input assets and sessions) · **Wave:** 3 · **Milestone:** later
- **Depends on:** #367 GCS-02A
- **Blocks:** nothing
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI)
  - [ ] Are generation sessions needed for the first release? There is no UI issue that shows or resumes a session.

### 48. #385 `NJS-09A` — Persist versioned Agents and pinned Skill references in GCS
- **Team:** node · **Phase:** P4 (Skills, guardrails, Agents, Brands) · **Wave:** 4 · **Milestone:** later
- **Depends on:** #378 NJS-07
- **Blocks:** nothing
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI)
  - [ ] No frontend issue moves the Agents page (Library kit) to the server. Add one, or is server-side Agents API-only for now?

### 49. #388 `PY-SKILL-AUTO` — Add later automatic Skill suggestions with Node authorization
- **Team:** node, python · **Phase:** P4 (Skills, guardrails, Agents, Brands) · **Wave:** 4 · **Milestone:** later
- **Depends on:** #381 PY-06, #383 PY-08
- **Blocks:** nothing
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI), Python lead
  - [ ] Confirm this is deferred beyond the first release ("later" in the title).

### 50. #399 `PY-14` — Isolate legacy Python Campaign/Firestore paths from new execution
- **Team:** python · **Phase:** P5 (Async, security, handoff) · **Wave:** 4 · **Milestone:** later
- **Depends on:** #353 PY-01, #365 PY-LIVE-01
- **Blocks:** nothing
- **Asks:**
  - [ ] Owner — Decision 10 role: Python lead

### 51. #402 `NJS-LEGACY-GCS` — Defer optional legacy Create Image output migration to GCS
- **Team:** node, frontend · **Phase:** P5 (Async, security, handoff) · **Wave:** 5 · **Milestone:** later
- **Depends on:** #397 NJS-13
- **Blocks:** nothing
- **Asks:**
  - [ ] Owner — Decision 10 role: Node lead (integration DRI), Frontend lead
  - [ ] Confirm this stays out of the first integration chain.

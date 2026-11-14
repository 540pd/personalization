# GCOS Personalization — Unified GCS-Only Architecture, Decisions, API Contract and Claude-Ready Implementation Issues — v2.10

**Version:** 2.10 (final dependency reconciliation, binary transport ownership, canonical GCS namespaces, complete QA matrix; 51 Claude-ready issues) · **Date:** 2026-10-26 · **Status:** Decisions 1–9 approved by product requester; Decision 10 specifies the proposed team-governance baseline pending named owners' acknowledgement. All code is **planned**, not claimed implemented.  
**Audience:** Node.js/Express, Next.js/Canvas, Python/FastAPI, cloud/security, integration owner, QA, Claude Code.  
**Source baseline:** uploaded `gcos-integration-issues.md`, `GCOS_Unified_GCS_Only_Integration_Architecture_and_Issues.md`, and repository ZIP snapshots `GCOS-personalization.zip` and `GCOS_backend_personalization_python.zip`. The original backlog was draft and not filed on GitHub. These names are proposed issue identifiers until filed.  
**Required outcome:** one existing canvas action causes an authenticated, auditable **Node.js → FastAPI → Vertex AI/Gemini → private GCS → Node.js image proxy → canvas** execution, supporting 1–10 requested outputs, and optional saved Skills, Brand, and reference images as follow-on features.  
**Application persistence NOW:** Google Cloud Storage only (binaries, JSON state, immutable history, library versions). **Operational dispatch:** Cloud Tasks is explicitly permitted and required for durable deployed async execution. **Not now:** BigQuery, Firestore, Cloud SQL, Audience/Campaign entities, ADK, video migration, new canvas framework.

> Read this entire document as **one contract**. No section or older issue description is allowed to silently override the approved decisions below. Both teams must approve the **same version/hash** of shared fixtures before contract-complete claims. Deployment configuration, Cloud IAM, model availability, performance numbers, and exact frontend Luma UI equivalence remain verifiable implementation gates—not facts already tested.

## Contents
1. Goal, verified baseline and product boundaries
2. Decisions 1–10 and explicit old-to-new decision changelog
3. Architecture: local, deployed and execution ownership
4. Canonical GCS object layout, state consistency, reservations and idempotency
5. Shared API contract: browser, Node, Python, workers, events and errors
6. Exact limits, status transitions, Skills, Brand, model settings and retry rules
7. Decision 10: accountable ownership, approvals and quality gates
8. Legacy-to-current issue ID mapping
9. Detailed implementation backlog: both teams, one sequence
10. Windows runbook, GCP handoff and test evidence
11. Risk register, rollout/rollback and definition of done
12. Source and official platform references
13. Original backlog Q1–Q28 — exhaustive resolution matrix
14. Reviewer findings 1–9, change register and verification
15. v2.2 contract consistency fixes
16. v2.3 job-index and final consistency corrections (historical review register)
17. v2.4 review clarifications and Claude-ready handoff corrections
18. v2.5 contract consistency changes
19. v2.6 GCS-02A/B split and single-owner corrections
20. v2.7 minimal hard dependencies and cross-team integration gates
21. Historical v2.8 integration review (superseded by v2.9 issue ownership)
22. v2.9 binding corrections, complete dependencies and sign-off checks (historical)
23. v2.10 final consistency corrections and pre-filing gate

---

## 1. Goal, verified baseline and product boundaries

### 1.1 What we are building and why Python exists
- **Keep** existing Next.js 15/Konva canvas, node panels, image-model picker, sign-in and old Create Image route.
- **Node.js/Express** stays the app's authenticated API, owner of user/asset/Skill/Agent/Brand access, job/session/request identifiers, GCS state, idempotency and preview proxy.
- **Python/FastAPI** becomes the generation engine: request semantics, Skill applicability, prompt enhancement, mandatory trusted guardrails, capability-aware Vertex image calls, actual model invocation recording, output image writing and verification data.
- **Two separate codebases** communicate by versioned HTTPS JSON; no shared database SDK coupling, no Python import in Node, no Node runtime imported by Python.
- **First live proof** is prompt → actual Gemini output → GCS → canvas. Do not wait for library persistence to prove this slice.

### 1.2 Verified/reviewed repository facts
| Area | Current snapshot | Source path / basis |
|---|---|---|
| Node app | Express with `createApp` | `backend/src/server.ts` |
| Existing create image | `/generate/image`, `modelId`, `instruction`, advanced settings, variants 1–10; results passed to browser as data URLs | `backend/src/routes/generate.ts`, `backend/src/services/generationService.ts` |
| Frontend | Next.js/Konva; Create Image caller exists | `frontend/src/app/canvas/components/NodePanel/kinds/imageKind.tsx` |
| Canvas | browser localStorage; frame images IndexedDB | `frontend/src/app/canvas/board/canvasPersistence.ts`, `frameImageStorage.ts` |
| Skills | localStorage, 100 KB upload UI limit, no persistent versions/hash | `frontend/src/store/skills.store.ts`, `lib/localList.ts` |
| Agents / Brand | Agents localStorage; Brand in memory; not applied to Create Image | `frontend/src/store/agents.store.ts`, `store/brand.store.ts` |
| Assets | Node routes largely stubs; GCS helper exists but no integrated GCS write path | `backend/src/routes/assets.ts`, `backend/src/lib/gcs.ts` |
| Legacy auth | existing verified sign-in and legacy `{error,message}` auth behavior | `backend/src/middleware/requireIdentity.ts`, `lib/sessionToken.ts` |
| Python | app currently has Campaign-oriented routers and `/healthz`; standalone `/v1/generation/execute` is not yet there | `app/main.py` in supplied Python ZIP |
| Python runtime | `requires-python = ">=3.13,<3.15"` in supplied project | Python `pyproject.toml` (so 3.14 is in declared range; 3.11 is not) |
| Python image client | reusable Vertex image abstraction in source | `app/services/image_model_client.py` (per earlier inspection; recheck code when implementing) |
| Browser tests | Playwright scripts installed, GitHub Actions CI reported disabled | `frontend/package.json`, original backlog |
| **Proxy transport (reviewed)** | Next.js proxy uses `req.text()` for all request bodies, forwards only `content-type` and `set-cookie`; unsafe for binary uploads and drops binary-response cache/security headers | `frontend/src/app/api/proxy/[...path]/route.ts` in uploaded repo snapshot |
| **Frontend auth / image load** | API helper supplies an in-memory bearer token for `fetch`; an HTML/Konva image URL does not use this helper. Backend `requireIdentity` requires a verified bearer credential, not a raw cookie | `frontend/src/api/canvas.api.ts`, `backend/src/middleware/requireIdentity.ts` in uploaded repo snapshot |
| **Existing `@skill` references (newer repo review)** | A reviewer reports that later main (`9251e34`) already applies `@skill` mentions in `/generate/image`, with legacy 20 Skills/400 KB limits (`mentionContext.ts`). Recheck **current checkout**, because the uploaded older ZIP may not contain those later commits | Reviewer-supplied `Pasted markdown(1).md`, not verified against newer main checkout |
| **IAP anonymous mode** | Deployed `AUTH_MODE=anonymous` + `IAP_PROTECTED=true` may mark all callers `anonymous`; personalization must reject that configuration until individual identity is cryptographically verified | `backend/src/middleware/requireIdentity.ts` + reviewer report |
| **Issue template** | GitHub requires `Screen IDs`, `User story`, `Acceptance criteria`, `UI states`, `Zoom invariance`, `Out of scope`, `Definition of done`; handoffs must be translated into that template | `.github/ISSUE_TEMPLATE/canvas-feature.md` in uploaded snapshot |

All paths are relative to their respective repo roots; paths introduced later in this plan are **proposed new files** until implemented.

### 1.3 Non-goals and legacy compatibility
- Personalization OFF: existing Create Image, text, video, local canvas and sign-in behavior **unchanged**.
- Personalization ON: user knows the engine. No silent fallback to legacy on Python/GCS failures; an explicit user choice can switch back.
- Legacy generated data-URL images are uploaded to GCS **on first use as new Python references**. Do not migrate old Create Image outputs until a separate later issue. The upload and binary preview must traverse a binary-safe authenticated Next.js proxy; an `<img src>` request alone does not carry the in-memory bearer token.
- Brand `campaignContext` stays optional **text art direction**; no Campaign entity/ID and no Audience requirement.
- Existing Google Vertex models only. Python validates real model capabilities and configured access; no assumed model names. **Legacy `@skill` mentions, when present on the checked-out main, must continue working with their existing limits while personalization is OFF; on the new path, picker + mentions are normalized into one deduplicated authorized selection limited by Decision 5.**

---

## 2. Approved decisions and reconciliation with the old backlog

### 2.1 Decisions 1–9: approved
| Decision | Binding behavior |
|---|---|
| **1 Multi-image** | `output.count` **1–10**, one user request, up to N successful outputs; model invocations and retry attempts are separately recorded. Default concurrency 2; all/partial/zero output states are distinct. |
| **2 Duplicate requests** | Frontend creates a fresh **idempotency key for a genuine new Generate action** and reuses it for double-click/network replay. Same owner+key+canonical payload returns same job/result. Same key/different payload -> 409. **7-day** protection. Node assigns request/job IDs. |
| **3 Reference images** | Up to **five** images total: at most one `main_image` plus up to four additional. PNG, JPEG, WebP; **10 MiB each**, **16 MP** maximum; model may impose stricter bounds. Roles: `main_image`, `product`, `logo`, `style_reference`, `background_reference`, `general_reference`. |
| **4 Output identity** | Node preassigns `asset_id`, `output_id`, slot and exact authorized GCS object key; Python writes image bytes to that destination, returns saved-object metadata; Node verifies objects and serves **authenticated binary proxy**, not signed-URL preview. |
| **5 Skills** | Max **5** selected; each UTF-8 `.md` <= **100 KiB**, combined raw selected <= **300 KiB**, effective instructions <= **30,000 characters**. Immutable integer versions + SHA-256; structured `applied/skipped/rejected` with reason codes; trusted mandatory guardrails separate. |
| **6 Status/errors** | Public job enum: **`pending`, `running`, `completed`, `partial_success`, `failed`, `needs_clarification`**. Async `202` acceptance; durable GCS job before returning. No blind retry on unknown model result. Stable errors including closed session, clarification, integrity, refusal, no-image, GCS save failure, 413. |
| **7 Model/latency** | Preserve current model controls subject to explicit model capability mapping. Prompt <= **8,000** Unicode characters; enhanced <= **16,000**; Python model timeout **240 s**; async job-accept timeout **15 s** (**not** a synchronous image-generation deadline); local direct count=1 smoke timeout **270 s proposed**; max job duration **25 min**; frontend poll **3–5 s**; concurrency **2**; mock `execution_mode: "mock"`, no fictional successful objects. GCS-only app state; Cloud Tasks allowed. |
| **8 UI + Brand** | Legacy Create Image OFF unchanged; Python outputs GCS+authenticated proxy; new Skill picker in **existing Create Image UI** (Luma reference comparison pending); multiple versioned Brands per user, at most one selected per request; `NEW-05` merged into `NJS-09B`; legacy output migration deferred. |
| **9 Auth/Cloud** | Existing verified GCOS sign-in, local ADC, separate Node/Python/Cloud Tasks service accounts; deployed IAM+OIDC; anonymous local **mock only**, no anonymous real generation; Cloud Tasks for deployed async; GCS objects private; local and deployed integration test paths. |

### 2.2 Decision 10 — recommended governance decision, awaiting named role assignment
- **Integration DRI:** Node.js technical lead, responsible for cross-team schedule, canonical fixtures, issue dependencies and sign-off collection; **Python technical lead is mandatory contract and live-path co-approver**.
- **Security/IAM approver:** Cloud/security owner; **Product UI approver:** frontend/product owner; **QA evidence owner:** frontend/QA lead with Python and Node team evidence.
- Individual names **must be filled in** in the issue header/handoff; the provided sources do not identify named current owners. We do **not** pretend the named assignments are already approved.
- One version-pinned contract and a single release checklist. **This remains a proposed owner-role assignment, not a named or completed approval.** Locally run Node vitest/typecheck, Python pytest, and frontend Playwright since CI is off. Only a signed-off live Cloud Run smoke test unlocks broader rollout.

### 2.3 Explicit changes from previously agreed D1–D18 / Q recommendations
| Earlier register | Old value | New authoritative value | Why changed |
|---|---|---|---|
| **D10 / Q1** mock output | `completed` with fake `gs://...` (or later proposed `mocked` status) | **`execution_mode: "mock"`, `status: "pending"`, `outputs: []`, `polling_allowed:false`, `status_url:null`; the mock response is terminal for the test harness, not a completed image job.** | No phantom assets or infinite frontend polling; preserve six production job statuses. |
| **D16** output count | Initially one-image Python path or older 1–10 count range without implementation guarantee | **Implement count 1–10 immediately** for Python real integration, including actual attempts, partial successes and reservation slots. | Decision 1 explicitly selected Option B. |
| **D13 / Q2** request ID | Node-issued; ignore browser request_id | **Still Node-issued; unchanged.** Add separate **frontend idempotency key**, not user request ID. | Clarifies two different identifiers. |
| **Q4** TS schema filename | `backend/src/schemas/personalization.ts` or `contracts/generationV1.ts` undecided | Prefer **`backend/src/contracts/generationV1.ts`**, handwritten validation; use exact name in both issue and tests. | No path ambiguity. |
| **Q21** unsupported references | Suggested automatic legacy fallback | **No silent fallback.** Show actionable error or explicit user-selected legacy path. | Avoid unannounced engine change. |
| **Q22** preview transport | Suggested signed URLs after review | **Authenticated Node.js binary proxy**. | Decision 4 Option A. |
| **Q25 / clarification** | Initially delay clarification or return 400 | **`needs_clarification` is a first-class job state** with `clarification.code="clarification_required"`; no generation model call when essential input absent. | Decision 6 Option A. |
| **M1/M6** live test timing | Wait until final milestone for live FastAPI | **Early real image smoke immediately after contract/mock gates**, while final production gate remains later. | Reduce integration risk. |
| **SH-02 / SH-04** storage | DB debate and BigQuery reporting | **GCS CAS JSON and immutable events only now**; BigQuery SQL is not run. Cloud Tasks dispatch is not an app database. | User-selected GCS-only phase. |
| **NJS-LIVE / PY-13** | Deployed Cloud Run appeared mandatory for live test | **Local direct real test first**; PY-13/Cloud Run IAM required only for deployed integration. | Avoid blocking local proof. |

**Interpretation:** previous proposal text and old issue IDs are historical inputs only. This document supersedes their conflicting implementation details; team approval of the shared contract is still required before coding cross-service features.

---

## 3. Architecture — local and deployed paths

### 3.1 Local direct CLI smoke versus local browser async integration

**Local synchronous direct smoke — CLI or authenticated test harness only (`count=1`):**

```text
Developer CLI / authenticated supertest (NOT the browser canvas)
  -> Express :4000 (verified local GCOS user, output reservation)
  -> FastAPI :8000 POST /v1/generation/execute
  -> Vertex AI / Gemini (one requested output)
  -> Python saves the Node-reserved object to private GCS
  -> Python terminal direct response -> Node verifies GCS object
  -> CLI/test harness verifies result; no browser proxy long-poll
```

**Local browser path (1–10 outputs) is different:** `Next.js canvas :3000 -> authenticated Express :4000 -> durable GCS job + 202 -> separate local dispatcher -> FastAPI /v1/generation/jobs/execute -> authenticated Node callbacks -> Node status polling + image proxy -> canvas`. This is implemented in **LOCAL-ASYNC-01**, not in PY-LIVE-01.
**Two deliberately different local modes (neither is the deployed Cloud Tasks flow):**

1. **`local_direct_smoke` — developer/CLI-only, `count=1`**: Node synchronously calls Python `POST /v1/generation/execute`. `PYTHON_DIRECT_TIMEOUT_MS=270000` (4m30s) is a **proposed local-only outer timeout**, allowing one model invocation up to 240 seconds plus bounded validation/GCS overhead. This request is **not subject to the 15-second acceptance timeout**. Return the full direct execution result (section 5.5A). Test using a signed-in local Node session and CLI/supertest; do not depend on the browser proxy surviving a 4.5-minute request. Direct mode explicitly rejects `count>1` with `400 unsupported_execution_mode`; this is a **mode constraint only**, not a reduction of the product's approved `count=1..10` range.
2. **`local_async` — real canvas and multi-image tests, `count=1..10`**: Node durably records the job in GCS, returns 202 within **15 seconds**, and a **separate explicitly running local worker/dispatcher process** invokes the same Python worker endpoint and Node callbacks used in deployed mode. No Cloud Tasks required locally; no in-request detached background thread. The frontend polls Node and renders authorized GCS previews. The worker must authenticate to local Node using a fixed, locally configured development service identity mechanism (never arbitrary browser headers); test harness may use injected verified service principal. Document/start this worker explicitly in the runbook.

**Direct smoke GCS index rule (v2.4):** `local_direct_smoke` is an **isolated synchronous CLI/harness test**, not an admitted asynchronous job. Node creates authenticated owner-scoped request/output reservation records as needed to verify the image, but **does not create either** `v1/index/jobs/{job_id}.json` **or** `v1/index/pending/{job_id}.json` and does **not** enqueue/dispatch work. A response may contain `job_id` as a correlation value, but it is **not discoverable through the async job polling API**; `GET /api/personalization/jobs/:job_id` is not part of the direct smoke contract. Do not repurpose the same ID for an asynchronous submission later. This avoids completed direct tests being redispatched by the local worker. A direct request that fails before finalization still has no global pending marker. Test the absence of both index objects after successful and failed direct smoke runs. The output reservation and owner are known from the authenticated in-flight request, not reverse-resolved through the global job index.

**Production** uses `local_async`'s contract and state machine with Cloud Tasks authenticated delivery instead of the local dispatcher. Do not claim local synchronous smoke verifies async job durability, task redelivery or service IAM.

### 3.2 Deployed async architecture (required for 1–10 outputs)
```text
Browser -> Next.js proxy -> Express POST /api/personalization/execute
  -> verify user sub and selected asset/Skill/Brand ownership
  -> idempotency lookup+create (GCS conditional write)
  -> reserve request_id, job_id, slot 1..N, asset_id/output_id + GCS keys
  -> persist job/request JSON + owner lookup + pending index in PRIVATE GCS
  -> enqueue named Cloud Task (OIDC service identity, job_id only)
  <- 202 {requestId,jobId,status:pending,statusUrl}

Cloud Tasks (OIDC) -> PRIVATE FastAPI worker POST /v1/generation/jobs/execute
  -> FastAPI fetches full authorized job manifest from Node internal API
     (Node resolves job_id through immutable global GCS job-owner index)
  -> FastAPI calls Node internal /claim endpoint to acquire durable GCS CAS lease
  -> prompt+Skills+guardrails+model capability checks
  -> at most TWO concurrent image-model invocations; requested slots 1..10
  -> write actual image bytes to Node-reserved private GCS object names
  -> send authenticated attempt/output/status events to Node internal callback
  -> Node validates event IDs, GCS objects + checksums; writes authoritative GCS state
  -> FastAPI completes task only after final event acknowledged

Browser -> Node GET /api/personalization/jobs/:jobId every 3–5s
  -> Node reads owner-checked GCS state and reports 6-state job status
  -> Browser GET /api/assets/:assetId/content (Node authenticates, streams GCS)
```
**Do not use a post-202 background thread on request-based Cloud Run** to replace Cloud Tasks. Cloud Tasks may deliver at least once; Python must claim/renew the job through Node's CAS state and reconcile reserved outputs before doing paid work. A Cloud Tasks task payload should be **opaque job ID + contract version**, not user's raw prompt or 300 KiB Skill text.

### 3.3 Trust and write boundaries
| Area | Node.js / Frontend | Python / Worker | Cloud / Admin |
|---|---|---|---|
| Auth | verify real user subject; reject anonymous for real paid calls; existing sign-in preserved | receive authenticated internal request, **never browser identity** | configure Run Invoker and task OIDC identities |
| Creation | Node makes request ID, job ID, session ID, slot reservations, `asset_id`, `output_id`, output object paths | echoes authorized IDs; generates distinct **`attempt_id` for each real model API call** | private bucket(s) |
| Inputs | Node authorizes asset ID and resolves GCS URI; enforces 5 refs, 10 MiB/16MP | re-checks byte type/model input bounds, reads authorized objects | bucket IAM and service identities |
| Intelligence | Node resolves approved immutable Skill/Brand/Agent versions | applicability, safe prompt understanding, guardrails, Vertex model execution | Vertex permissions and availability |
| State | **Node only** writes authoritative sessions/jobs/idempotency/asset catalog/version pointers and immutable events into GCS | posts authenticated events, **not direct mutable state writes** | GCS CAS, retention, audit |
| Images | Node assigns exact output GCS names and verifies actual objects | Python uploads binaries only under assigned output paths | IAM least privilege |
| Previews | Node owner-checks and streams via authenticated `/api/assets/:assetId/content` | never serves public URLs | keep bucket private |
| Delivery | user accepts request via Node, task created after GCS state | Cloud Tasks OIDC worker, service-level lease + reconciliation | Cloud Tasks dispatch deadline, queue rate caps |

**Internal callbacks:** introduce `GET /internal/personalization/jobs/:jobId/payload`, `POST /internal/personalization/jobs/:jobId/claim` and `POST /internal/personalization/jobs/:jobId/events`, protected by service-to-service identity (Python service account on private Node Cloud Run or an equivalently verified audience). **Each handler resolves the immutable `v1/index/jobs/{job_id}.json` first** to find the owner-scoped job snapshot; it must verify the returned `request_id` and IDs against that snapshot before reading payload, granting leases or accepting events. Do not expose these browser routes. Use `event_id` dedupe and request/job ID matching in every callback.

### 3.4 Security sequencing
1. Local: valid GCOS user signs in through existing OAuth/session flow; GCP ADC accesses Vertex and GCS. Anonymous development permitted **only for mock**. Local loopback Python is dev-only, not a substitute for production service auth.
2. Deployed: private Python Cloud Run with `roles/run.invoker` for the task identity (and Node where direct service calls are permitted); Cloud Tasks creates OIDC tokens; separate service accounts Node, Python and task invoker. Python service identity permitted to call private Node internal callback endpoints.
3. Existing proxy's fail-open behavior when infra token minting fails is **NEW-03** security gate before deployed rollout. Do not change login middleware as an incidental part of NJS-03.
4. Node owns per-user authorization; GCS folder names **do not** enforce per-user IAM. Never trust client `gs://`, `output_target`, `owner_key`, `request_id`, service principal or Skill content.
5. Network/ingress configuration must actually permit private service calls; 'internal-only' setting must be separately tested (IAM and ingress are different controls).

---

### 3.5 Browser binary transport, authentication, and canvas persistence (v2.8 binding)

**Browser image loading:** A direct `<img src="/api/proxy/assets/...">` or Konva URL load cannot attach the in-memory bearer token used by `frontend/src/api/canvas.api.ts`; the backend does not currently authenticate arbitrary `gcos_session` cookies as bearer identity. The new flow **must use the existing authenticated API helper** to `fetch` an authorized image response as `Blob`, build a temporary `URL.createObjectURL(blob)` for preview/Konva, and revoke that URL only after image replacement/unmount. Authenticate every byte request through Node, enforce owner access before returning content, and never persist a Blob URL, identity token, `gs://` path, or signed URL in a node. A revoked token must not be replaced by an implicit cookie authentication bypass.

**Binary proxy:** `frontend/src/app/api/proxy/[...path]/route.ts` must proxy supported binary uploads **without `req.text()` decoding** and preserve an allowlist of image/content/security headers. **NEW-03-TRANSPORT** solely owns binary-safe request/response forwarding and byte-identity tests and may merge without cloud/security sign-off. **NEW-03** separately owns fail-closed infrastructure OIDC, trusted user-identity propagation and security sign-off; its approval is a **deployed release gate**, not a code prerequisite for local NEW-01/NJS-13-LITE/FE-SMOKE-01. `NEW-01` owns Node's single-image binary upload parser and validation; `NJS-13-LITE` owns authorized backend image streaming; `FE-SMOKE-01` owns authenticated Blob loading/canvas migration. The local test must still use a verified user and its existing trusted local development boundary. No issue creates another shared proxy.

**Persistence:** For personalization nodes persist `{jobId, requestId, status, outputs:[{assetId,slot,mimeType,width,height}], idempotencyKey for outstanding submission}` using the existing canvas persistence system. On reload, authenticate, restore pending jobs and resume polling at 3–5s; terminal outputs reload via the authorized Blob fetch. Retain existing data-URL/IndexedDB schema for legacy nodes; use a **versioned discriminator** for new `gcs_asset` references and migrate explicitly. Undo/redo and drag-out copy asset references (not blob URLs); node deletion only removes references, not the underlying GCS object. Download fetches authorized bytes, and passing a GCS-backed asset to the old Create Image route uses a bounded, explicit compatibility conversion with a clear error when legacy request-size limits would be exceeded. Do not silently degrade quality or switch models.

**Deployed IAP:** `AUTH_MODE=anonymous` + `IAP_PROTECTED=true` is **NOT** a verified per-user identity. Reject real personalization and private asset operations in this mode. Future native IAP identity may be supported only after verifying the signed IAP assertion (issuer, audience, signature) and extracting a stable provider subject. Do not use user-supplied IAP/email headers as owner identity.

**Legacy Skills:** Where current main already supports `@skill` mentions, do not remove it. For personalization, combine picker selections and recognized `@skill` references into one **server-resolved, owner-authorized, deduplicated** set of <=5 Skills, <=300 KiB raw content, <=30,000 effective instruction characters; hard reject over-limit, unresolved or ambiguous references. Existing legacy mention parsing/limits stay unchanged when the feature flag is OFF. Python receives only pinned trusted-content metadata via the existing strict five-field Skill contract, and treats Markdown as untrusted instructions.

## 4. Canonical GCS data model and consistency

### 4.1 Buckets (storage only; no DB)
**Repository-compatible configuration:** `backend/src/lib/gcs.ts` and `/api/health` currently read `GCS_BUCKET_NAME`. For the first development integration, use **one private bucket** from `GCS_BUCKET_NAME` and use `v1/index/` and `v1/users/` for authoritative state, and `v1/inputs/` and `v1/outputs/` for private binaries. GCS IAM permissions apply to the bucket unless managed-folder IAM/other supported boundaries are actually configured; object prefixes alone do not enforce access control. Never invent `STATE_BUCKET` / `ASSET_BUCKET` environment variables without implementation. For production with separate IAM boundaries, optionally introduce `GCS_STATE_BUCKET_NAME` and `GCS_ASSET_BUCKET_NAME`, with a documented explicit fallback to `GCS_BUCKET_NAME` for local/dev; update the helper, health checks, IAM, test setup and deployment docs in GCS-01 before using the new values. **The code below uses logical STATE_BUCKET/ASSET_BUCKET placeholders; those can point to the same physical GCS bucket in v2.8 dev mode.** Do not treat a prefix as a standalone bucket-level permission boundary.

```text
# STATE_BUCKET — only Node.js writes authoritative state
v1/index/jobs/{job_id}.json                         # immutable job_id -> owner_key,request_id lookup
v1/index/pending/{job_id}.json                      # nonterminal job marker for dispatch/reconciliation
v1/users/{owner_key}/sessions/{session_id}/session.json
v1/users/{owner_key}/requests/{request_id}/request.json
v1/users/{owner_key}/jobs/{job_id}/job.json                 # CAS snapshot; authoritative current status
v1/users/{owner_key}/jobs/{job_id}/events/{event_id}.json  # immutable, deduped events
v1/users/{owner_key}/jobs/{job_id}/attempts/{attempt_id}.json
v1/users/{owner_key}/jobs/{job_id}/outputs/{output_id}.json
v1/users/{owner_key}/idempotency/{sha256_of_key}.json
v1/users/{owner_key}/assets/{asset_id}/manifest.json
v1/users/{owner_key}/skills/{skill_id}/versions/{version}.md
v1/users/{owner_key}/skills/{skill_id}/versions/{version}.json
v1/users/{owner_key}/skills/{skill_id}/latest.json
v1/users/{owner_key}/agents/{agent_id}/versions/{version}.json
v1/users/{owner_key}/agents/{agent_id}/latest.json
v1/users/{owner_key}/brands/{brand_id}/versions/{version}.json
v1/users/{owner_key}/brands/{brand_id}/latest.json

# ASSET_BUCKET — private images/binaries; authorized access only
v1/inputs/users/{owner_key}/assets/{asset_id}/original.{ext}
v1/inputs/users/{owner_key}/brands/{brand_id}/references/{asset_id}.{ext}
v1/outputs/users/{owner_key}/requests/{request_id}/slots/{slot_padded}-{asset_id}.{ext}
```
**Fixture owner key:** `u1_0123456789abcdef0123456789abcdef` is a structurally valid example (`u1_` followed by exactly 32 lowercase hex characters), **not** an actual HMAC output or a usable credential. Validators must enforce `^u1_[0-9a-f]{32}$`; deployed keys must be computed by Node, never accepted from clients.

`owner_key`: stable opaque namespace **computed by Node** from verified identity-provider issuer and verified `sub`. **Concrete design:** `owner_key = "u1_" + lowercase_hex(HMAC_SHA256(OWNER_KEY_HMAC_V1, issuer + "\0" + sub))[0:32]`. The secret is a randomly generated **256-bit** key; only the Node service has access. Store the production secret as a version-pinned Google Secret Manager secret mounted/injected into Node Cloud Run, not in GCS, Git, or browser-readable config. Store an unrelated dev secret in an ignored local `.env` (or local secret store). Secret Manager is **secret infrastructure**, not a second application persistence database. The secret's **version `v1` is immutable for this namespace**: rotation requires explicit identity-to-path migration or a versioned dual-lookup plan. Back up/manage access per security policy; losing the key without a mapping loses deterministic path lookup. Never raw email or user-provided ID. The prior design used attempts in output object path; **that is changed** because Node must reserve each output before Python decides which model attempt produces it. Link the saved output to `attempt_id` in the output manifest, not in the output object name. Optional `session_id` stays in the request JSON; outputs still resolve without a session.

### 4.1.1 Implementation split: minimal state vs async control

**GCS-02A** implements the minimal Node-only GCS state adapter: create-only output reservations and asset manifests, GCS generation/CAS primitives, authenticated owner scoping, and the **entire seven-day duplicate-request check** (client key -> one request/job, same payload returns existing 202/200, different payload returns 409, 90-day tombstone policy subject to approval). It is required for the first count=1 live smoke. That isolated direct test reserves/verifies an output but does **not** make global job-owner/pending indexes or run a dispatcher.

**GCS-02B** builds on GCS-02A and implements the complete async admission/index layer independently of the public NJS-04 route, `job_id` lookup, pending marker scan/recovery, guarded internal `/payload`, `/claim`, `/events` routes, 60-second leases, renewal/fencing, event dedupe and crash reconciliation. It must merge before LOCAL-ASYNC-01 or ASYNC-01, but is **not** needed for NJS-LIVE-01. In particular, GCS-02B **reuses** GCS-02A's seven-day idempotency service; it does not implement a second replay protocol. Both issues use the approved NJS-02 contract types (GCS-02B lists NJS-02 explicitly, despite its transitive inclusion through GCS-02A, to make this reviewer-critical contract gate unambiguous).

**Single-owner rule:** the first public `GET /api/personalization/jobs/:jobId` status route belongs to LOCAL-ASYNC-01; NJS-12 extends that existing route with full error mapping and slot retry. NJS-11 only adds audited request/invocation/output accounting and lineage, not duplicate-submit acceptance checks or a second status route.

### 4.1A Global job indexes (implemented by GCS-02B) — required because the worker supplies only `job_id`

**Applicability:** The global immutable owner and pending indexes are mandatory for **accepted asynchronous jobs**, including local async, Cloud Tasks jobs and **new child jobs created by failed-slot retries**. They are **not** created by the `count=1` synchronous `local_direct_smoke` CLI route; see §3.1. An asynchronous retry creates a fresh `{request_id, job_id}` and therefore **must create both indexes using the same admission and recovery sequence in §4.1A**.

GCS object names are not searchable by an unknown `owner_key`. **Every internal job lookup first reads** `v1/index/jobs/{job_id}.json` from the private STATE_BUCKET, then loads `v1/users/{owner_key}/jobs/{job_id}/job.json`. The global indexes are **server-internal metadata** and are never exposed to browser callers. Only Node may create/remove them. Job IDs must be high-entropy server-generated identifiers, and all internal requests must authenticate the calling service; a guessed `job_id` is not authorization.

**`state.index.job_owner.json` — immutable index object, created once with `ifGenerationMatch=0`:**

```json
{
  "schema_version": "1",
  "job_id": "job_001",
  "owner_key": "u1_0123456789abcdef0123456789abcdef",
  "request_id": "req_001",
  "created_at": "2026-10-26T09:00:00Z"
}
```

**`state.index.pending.json` — create-once *nonterminal marker*, also `ifGenerationMatch=0`:**

```json
{
  "schema_version": "1",
  "job_id": "job_001",
  "owner_key": "u1_0123456789abcdef0123456789abcdef",
  "request_id": "req_001",
  "created_at": "2026-10-26T09:00:00Z"
}
```

The marker means **not known terminal**, not necessarily `status=pending`: it remains while a job is `pending`, `dispatch_pending`, or `running`. The dispatcher and periodic recovery worker list the paginated `v1/index/pending/` prefix, resolve each marker's immutable owner mapping, and read the authoritative job snapshot to decide whether to dispatch, skip an active lease, reconcile, or retire the marker. Never infer actual status from the marker alone, and never enqueue a duplicate simply because the marker exists. A stale marker left after terminal completion is safely removed during reconciliation.

**Scope invariant:** This sequence is executed once for every newly accepted async job, **including a child failed-slot retry job**. The original terminal job keeps its existing immutable owner index and no pending marker; the child job gets its own owner and pending markers, idempotency reservation and output slot. The isolated direct-smoke route skips this sequence completely.

**Creation order and recovery (there is no multi-object transaction):**

1. Authenticate the user; reserve the client idempotency key and server-generated `{request_id,job_id}` durably. Record `admission_state=creating` in the reservation until the necessary records exist.
2. Conditionally create both indexes (`jobs/{job_id}.json`, then `pending/{job_id}.json`) before queueing or returning `202`; write/verify the owner-scoped request and job manifests with the same IDs and owner. Transition the idempotency reservation to `admission_state=ready` by CAS. If a duplicate arrives during `admission_state=creating`, use its original reserved IDs to resume/read the same admission: do not return a premature `202` for an incomplete job and do not allocate new IDs.
3. Enqueue one deterministically named task; if enqueue fails, keep the pending marker and authoritative snapshot with `dispatch_pending=true`. Only return `202` once the durable job is complete and either task dispatch is confirmed or the documented recovery mechanism can redispatch it. Never claim a job is running merely because an index exists.
4. On authenticated terminal state commit, Node marks the job terminal via CAS, then deletes the pending marker using a generation-match precondition. **Deletion failure is nonfatal and recoverable**: the scanner must recognize terminal jobs and remove orphan markers without scheduling new work.
5. On interruption mid-admission, the scanner may find an index with an absent or incomplete job snapshot. It must **not** create a paid model call: reconcile against the idempotency reservation/request manifest, complete a recoverable admission, or mark/alert it as an incomplete orphan according to an explicit age threshold. The original client replay can also resume admission using the reserved IDs. An object-index collision or owner mismatch is a security/integrity error, never an overwrite.

The immutable job-owner index remains as long as the job history remains addressable (normally 90 days in the proposed development retention). The pending marker is removed promptly on terminal transition, and orphan removal is separately covered by the cleanup job. If retention deletes the immutable index, Node must return the defined missing/expired history response rather than search other users' folders. Neither index is a transactional queue: local dispatcher/reconciler runs as a separate process; deployed Cloud Tasks remains the durable delivery mechanism. **GCS listing is a bounded operational scan only for pending markers, not a full user-folder scan.**

**Index tests required:** global `job_id` lookup for payload/claim/events without owner in the URL; 1/3/10 nonterminal jobs visible through a paginated pending listing; duplicate create preconditions; conflicting owner index; process crash at each admission step; orphan index repair; enqueue failure and replay; terminal marker removal; stale marker cleanup; concurrent scanners without duplicate paid execution; history retention and missing-index behavior.

### 4.2 Write behavior and recovery
- **Create-only:** `ifGenerationMatch=0` for immutable versions, idempotency reservation, events, request/job first record and output objects; a `412` means conflict or already exists, **not permission to overwrite**.
- **Mutable snapshot:** read bytes and GCS generation, update with matching generation precondition; on 412 reload, merge/reject using a strictly defined transition. Never use blind read/modify/write.
- **Single authoritative writer:** only Node updates job and session snapshots and manifests. Python reports event IDs over authenticated internal callbacks. Node upserts immutable events first, then CAS updates snapshot; a reconciler can repair snapshots from events.

#### Status transitions (exact six-state public enum)

```text
pending --> running
pending --> failed
pending --> needs_clarification
running --> completed
running --> partial_success
running --> failed
running --> needs_clarification
```

`completed`, `partial_success`, `failed` and `needs_clarification` are terminal for that particular submission. A clarification requires a new linked submission and no paid image invocation in the clarification-only request. These are **status changes**, not concatenated names; internal `dispatch_pending` or `reconciliation_required` flags do not create new public states.

- **Partial success:** if `0 < saved_count < requested_count` after all slots reach terminal state, use `partial_success`; `completed` iff **all N reserved outputs are verified**, `failed` if zero outputs or a request-wide unrecoverable error.
- **Reconciliation:** before claiming a retried delivery, inspect immutable job events and reserved GCS slots; if object exists, verify it and attach to the corresponding output rather than regenerate. A model timeout may still have billed/generated; no blind second model call.
- **Queue enqueue window:** follow the index-and-manifest admission protocol in §4.1A before task creation; if Cloud Tasks creation fails, mark `dispatch_pending` (internal field, public status `pending`) and retry enqueue using the deterministic task name. The operational reconciler lists **`v1/index/pending/`**, validates each owner mapping and authoritative snapshot, then redrives only eligible jobs. Do not scan all users, do not depend on browser polling, and never issue a paid model call merely from an index marker. Cloud Scheduler may be an operational trigger, not an application data store.
- **Lease/at-least-once — initial exact settings:** Node issues a **60-second lease** with `lease_token` (random opaque, only its digest stored), `lease_holder`, `lease_expires_at` (UTC), and monotonically increasing `fencing_token`. The worker heartbeats/renews **every 20 seconds** using CAS; Node accepts renewal only for the current lease token and fencing token, and extends expiry by 60 seconds from Node server time. A competing worker's claim receives **409 `lease_held`** while active. If a heartbeat fails, Python must stop scheduling new paid model calls; already-running invocations may be uncertain and must be reconciled. On expiry, add a **30-second observation/grace interval** before reassignment; only one new claimant obtains a higher fencing token via CAS. **A stale worker must be rejected on all callbacks and authoritative Node output-manifest commits** by token/fence validation. A stale worker with GCS permissions may still have written image bytes; those bytes are not an authorized completed output until Node reconciles and verifies them. CAS fencing does not prevent every physical GCS write or guarantee exactly-once external charges. An expired lease does NOT prove an in-flight Gemini invocation stopped, so never automatically regenerate an uncertain slot. Persist `reconciliation_required` as an internal diagnostic and escalate unresolved outcomes; GCS cannot guarantee exactly-once external model billing. Use controlled virtual-time tests for 60s expiry, 20s renewals, delayed callbacks, crash, duplicate delivery, and stale token rejection.
- **GCS limitations:** there is no multi-object transaction, relational query index, or execution queue. GCS-only is appropriate for controlled/demo workloads with bounded concurrency; production-scale workloads require architecture review if contention/cost grows.

### 4.3 Seven-day idempotency protocol (implemented by GCS-02A; reused by every async path)
1. Frontend creates `idempotencyKey` on a **new intentional Generate action**, immediately disables repeated-click submission, and retains the same key across network replay/reconnect for that action. Pressing Generate anew intentionally obtains a new key.
2. Node validates key shape/length, computes **owner-scoped hash** and a canonical fingerprint of the **stable validated browser submission** (operation/prompt/model/settings/reference IDs/selected Skill IDs/selected Brand ID/output count). **Check an existing key before re-resolving mutable latest Skill/Brand versions**. On first acceptance, separately freeze the server-resolved versions into the job manifest. Otherwise a Skill edit between a network retry and the original submission could spuriously trigger 409. Do not put raw key in an object name.
3. GCS conditional create idempotency record `{request_id,job_id,request_fingerprint,created_at,expires_at}`. On precondition failure, read record and verify same owner and fingerprint.
4. If same key/same payload: return **202 original job** while pending/running, **200 original result** when terminal. If different payload: **409 `idempotency_key_conflict`**. Never queue a second job for the same key.
5. Protect the key for **7 days from initial acceptance**; expiration is checked in code using UTC timestamps. Keep a lightweight **key tombstone/record for 90 days** (proposed dev policy) so a replay between days 8–90 returns `409 idempotency_key_expired` instead of regenerating. After tombstone deletion the platform cannot detect a replay by key alone; clients must not replay requests beyond seven days, and external exactly-once guarantees after tombstone expiry are not claimed. A fresh intentional action must use a new key. Configure GCS lifecycle with a retention floor **longer than seven days** and test the expiry boundary. History is retained separately.
6. Browser cannot choose request/job/asset IDs; Node always generates them. Cloud Tasks named delivery identity and worker lease are **separate** from frontend idempotency and cover duplicated dispatch.

### 4.4 Slot reservation and response validation
- For count N, Node creates N records `{slot:1..N, asset_id, output_id, exact_bucket, exact_object_name, format}` and embeds them in a **server-authored `output_target`** inside the Python-only payload.
- Python may associate one model invocation with several slots, or use separate calls, but may not emit >N outputs or write to unreserved keys. Concurrency 2 by default.
- Python uploads with create-only precondition, returns `gcs_generation`, actual `sha256` from bytes, size, MIME, dimensions, attempt ID and slot.
- Node retrieves/HEADs object, checks exact bucket/name/generation, owner/job reservation, type, size and checksum. The **application SHA-256 is computed** from bytes or verified from trusted metadata; do not mistake GCS CRC32C or ETag for SHA-256.
- If model returns bytes but GCS write fails: slot remains failed/pending with `output_save_failed`, and no catalog success. If all but one saved: `partial_success` after processing is final.
- Preview reads only verified catalogued outputs with user authorization, via `GET /api/assets/:assetId/content`; no public objects and no signed URLs for this phase.

### 4.5 Immutable library state
- Skill saved as `.md` UTF-8 immutable integer version, exact SHA-256, and CAS latest pointer; user owns content but **it never becomes trusted policy**.
- Agent config versions pin `{skill_id, version}`. Manual Skill picker can send IDs, with Node resolving/pinning latest authorized versions **at request creation time**. Max five selected.
- Brand: many profiles per user, one versioned Brand per request (optional), multiple immutable JSON versions; `campaign_context` is plain text only. Reference images are assets, not embedded data URLs.
- Deletion uses tombstone/soft-delete with policy-controlled retention, so earlier generation records can still trace versions. Admin security/deletion policies override historical retention when legally required.

---

## 5. Shared API contract v1 — one canonical version

**Contract owner:** Node.js integration DRI maintains the canonical `docs/contracts/generation/v1/` in the Node repo until a separate shared contract repo is approved; Python lead must co-approve schema and fixtures. Both teams pin the **same Git commit SHA/tag and fixture SHA-256 manifest**; Python may vendor a read-only generated copy, never create a separate editable master. The contract is `schema_version: "1"` for Node ↔ Python, while frontend uses camelCase without a schema version field. Preserve existing legacy authentication errors.

### 5.1 Public API routes

| Method and path | Purpose | Result |
|---|---|---|
| `POST /api/personalization/execute` | Authenticated submit, strict validation, idempotent GCS job/reservations and dispatch | `202` accepted; `200` duplicate terminal result; `409` key conflict |
| `GET /api/personalization/jobs/:jobId` | Owner-checked job status and outputs | `200` with camelCase job record |
| `POST /api/personalization/jobs/:jobId/slots/:slot/retry` | Authenticated explicit single failed-slot retry with **new idempotency key**, safe-retry validation, linked new request/job | `202` new job; `409` already active/conflict/unsafe |
| `GET /api/personalization/requests/:requestId` | Owner-checked request history; may resolve to job | `200` |
| `GET /api/assets/:assetId/content` | Authenticated private GCS image stream | `200` image bytes; `404` cross-user/unknown |
| `POST /api/assets` | Validated image upload (when asset milestone delivered) | `201` with Node-created asset ID |
| `/api/generation-sessions` | Create/resume/close Node-owned generation sessions | after NJS-05 |
| `GET /healthz` on Python | Existing Python readiness | `{ "status": "ok" }` in submitted Python snapshot |
| `POST /v1/generation/execute` on Python | **Same route for contract mock and local real direct smoke**; Python server-owned `PYTHON_GENERATION_BACKEND` selects mock versus Vertex; real direct requires count=1, mock validates count=1..10 and returns non-polling test response | `200` direct/mock result; `400 unsupported_execution_mode` for real direct count>1 |
| `POST /v1/generation/jobs/execute` on Python | Private authenticated Cloud Tasks/local dispatcher worker route (opaque IDs); no browser calls | 2xx after finalization acknowledged or duplicate delivery safely identified as already running |
| `GET /internal/personalization/jobs/:jobId/payload` | Python service fetches authoritative bounded job payload | private, authenticated |
| `POST /internal/personalization/jobs/:jobId/claim` | Python service acquires/renews 60s lease using Node GCS CAS; explicit action acquire/renew | private, authenticated; 200 or 409 lease_held/stale_worker_lease |
| `POST /internal/personalization/jobs/:jobId/events` | Python sends idempotent model/output/status events | private, authenticated |

**Legacy-vs-new jobs:** Keep old `GET /api/generate/job/:jobId` + existing `getJob()` statuses (`pending/done/failed`) untouched. Implement new `getPersonalizationJob(jobId)` for `GET /api/personalization/jobs/:jobId` with the approved six states. The **only** explicit new retry route is `POST /api/personalization/jobs/:jobId/slots/:slot/retry` (never unprefixed `/jobs/:id/...`).

**Endpoint ownership:** GCS-02B implements Node internal `/payload`, `/claim`, `/events`. LOCAL-ASYNC-01 first implements and registers the browser-facing `GET /api/personalization/jobs/:jobId` polling route. NJS-12 extends this same route with richer terminal failures, retry links and complete error mapping. GCS-02A owns the idempotency reservation/check used by the initial local 202 handler, deployed ASYNC-01 and failed-slot retry; NJS-11 consumes its durable records for statistics and must not recreate it.

**No token, `owner_key`, private URI, GCS credentials, Python service URL or raw Skill Markdown should be sent to the browser.** Existing frontend API proxy still handles user sign-in; new personalization errors may be nested, while login/token-expiry errors preserve legacy `{error:"token_expired", message:...}` compatibility.

### 5.2 Browser → Node request (camelCase; illustrative real request for 3 images)

```json
{
  "nodeId": "node_001",
  "boardId": null,
  "generationSessionId": null,
  "idempotencyKey": "fresh-client-action-uuid-001",
  "operation": "create_image",
  "prompt": "Create three premium red sneaker photographs",
  "inputAssets": [],
  "selectedSkillIds": [],
  "brandId": null,
  "model": {
    "modelId": "configured-allowed-model-alias",
    "imageSize": "1K",
    "quality": null,
    "thinking": null,
    "temperature": null,
    "grounding": null
  },
  "output": {
    "aspectRatio": "1:1",
    "count": 3
  }
}
```
- `inputAssets[]` when enabled contains `{assetId,role}` **only**; never browser `gs://` or base64. The six approved role strings are enforced. An absent `main_image` is fine for text-to-image, but missing for operations that need editing.
- Browser sends **no** `requestId`, `jobId`, `outputTarget`, `ownerKey`, `schemaVersion`, `attemptId` or raw Skill Markdown. Ignore and never use any accidental browser `requestId` per earlier compatibility agreement, but **reject** client-supplied output destinations or raw GCS references.
- `idempotencyKey` required for real async generation; Node validates shape and handles seven-day replay. `nodeId` required for canvas execution; `boardId` optional/null and never proof of access.
- New endpoint supports `create_image` first, with `count` **1–10 immediately**. Input images and Skills are enabled in their later issues; until then reject nonempty corresponding fields rather than silently ignore them.
- Frontend model settings present in the old panel must not be silently dropped. Python-approved model registry distinguishes unsupported/disabled model options, including quality/thinking/grounding/temperature.

### 5.3 Node → Python full execution payload (snake_case, always Node-authored)

```json
{
  "schema_version": "1",
  "request_id": "req_001",
  "job_id": "job_001",
  "session_id": null,
  "board_id": null,
  "node_id": "node_001",
  "operation": "create_image",
  "prompt": "Create three premium red sneaker photographs",
  "inputs": [],
  "skills": [],
  "brand": null,
  "model": {
    "model_id": "configured-allowed-model-alias",
    "image_size": "1K",
    "quality": null,
    "thinking": null,
    "temperature": null,
    "grounding": null
  },
  "output": {"aspect_ratio": "1:1", "count": 3},
  "output_target": {
    "bucket": "APPROVED_PRIVATE_ASSET_BUCKET",
    "prefix": "v1/outputs/users/u1_0123456789abcdef0123456789abcdef/requests/req_001/slots/",
    "format": "image/png",
    "slots": [
      {"slot": 1, "asset_id": "asset_101", "output_id": "out_101", "object_name": "v1/outputs/users/u1_0123456789abcdef0123456789abcdef/requests/req_001/slots/001-asset_101.png"},
      {"slot": 2, "asset_id": "asset_102", "output_id": "out_102", "object_name": "v1/outputs/users/u1_0123456789abcdef0123456789abcdef/requests/req_001/slots/002-asset_102.png"},
      {"slot": 3, "asset_id": "asset_103", "output_id": "out_103", "object_name": "v1/outputs/users/u1_0123456789abcdef0123456789abcdef/requests/req_001/slots/003-asset_103.png"}
    ]
  }
}
```
**This is the canonical output-target field absent from the original draft.** Node authorizes the owner and builds it. In Cloud Tasks mode, Python obtains this JSON from the authenticated Node internal payload route rather than accepting it from the task body. Python validates the allowed bucket and request prefix itself. Node pre-creates all asset and output IDs; Python is responsible for `attempt_id` per **actual invocation**.

When Skills are enabled, each internal Skill has `{skill_id,version,sha256,content,selection_mode}`; allowed modes are `manual|automatic`, the maximum is 5, and Node checks ownership, size and hash first. Brand is optional version-pinned sanitized context. Input records are `{asset_id,gcs_uri,mime_type,role}` constructed only from authorized Node catalog entries.

### 5.4 Browser accepted response and final status (camelCase)

```json
{
  "schemaVersion": "1",
  "requestId": "req_001",
  "jobId": "job_001",
  "executionMode": "real",
  "status": "pending",
  "requestedCount": 3,
  "succeededCount": 0,
  "failedCount": 0,
  "outputs": [],
  "statusUrl": "/api/personalization/jobs/job_001"
}
```
HTTP **202** for accepted/pending or duplicate still in progress. **200** returns existing terminal job **or a local-only mock acceptance with polling disabled**. `GET /jobs/:jobId` returns one of the six approved statuses, counts, authorized output asset IDs and preview URLs, `failedSlots`, `clarification`, and sanitized details. Do not leak private `gs://` references to browser responses.

### 5.5 Python execution result / callback event (snake_case)

```json
{
  "schema_version": "1",
  "event_id": "evt_unique_001",
  "request_id": "req_001",
  "job_id": "job_001",
  "event_type": "output_saved",
  "lease_token": "FIXTURE_ONLY_LEASE_TOKEN_001",
  "fencing_token": 7,
  "attempt_id": "att_001",
  "slot": 1,
  "output_id": "out_101",
  "asset_id": "asset_101",
  "gcs_uri": "gs://APPROVED_PRIVATE_ASSET_BUCKET/v1/outputs/users/u1_0123456789abcdef0123456789abcdef/requests/req_001/slots/001-asset_101.png",
  "gcs_generation": "123456789",
  "mime_type": "image/png",
  "size_bytes": 900000,
  "width": 1024,
  "height": 1024,
  "sha256": "bce3110f5aab65ddda45d8cdebd7cedd692e26309f8c3c96af5c1c648ab2a2d1",
  "retry_of_attempt_id": null
}
```
The SHA-256 value and all URIs above are **illustrative fixtures** only. A real uploaded image must report a checksum computed from its actual bytes; Node verifies metadata against the exact preallocation. Every callback is authenticated with verified service identity, carries current `lease_token` + `fencing_token`, and is deduped by `{job_id,event_id}`. Python also sends `attempt_started`, `attempt_finished`, `slot_failed`, `clarification_required` and `job_finalized` typed events with validated schemas (separate JSON fixture for each). The callback endpoint is Node-only and **not accessible through the browser proxy**.

### 5.5A Synchronous direct-route result — explicit fixture and error cases

`POST /v1/generation/execute` exists **only for local direct smoke and contract testing**, not the browser's deployed async submit path. It is served by **one route with a server-owned mode selector**, not two conflicting route implementations: `PYTHON_GENERATION_BACKEND=mock` validates the contract and immediately returns the mock fixture for count=1..10; `PYTHON_GENERATION_BACKEND=vertex` runs a real direct call and **requires `output.count==1`**. No browser-supplied `execution_mode` or header may switch the backend. In a Cloud Run worker deployment, `PYTHON_GENERATION_BACKEND=vertex` is required and mock is rejected at startup. The real direct route accepts the full snake_case request in 5.3 but **requires `output.count==1`**; the larger product range `1..10` is exercised via `local_async` or deployed Cloud Tasks. It blocks until a terminal outcome and responds with **HTTP 200** for a completed/failed/clarification execution (business outcome is in `status`), or a normalized 4xx/5xx transport/validation error. `PYTHON_DIRECT_TIMEOUT_MS=270000` is the Node-client local-only deadline; Python's per-model deadline remains 240000 ms. It must never return `pending` after running real generation synchronously.

**`response.python_direct.completed.json` — one genuinely stored image:**

```json
{
  "schema_version": "1",
  "request_id": "req_direct_001",
  "job_id": "job_direct_001",
  "session_id": null,
  "node_id": "node_001",
  "execution_mode": "real",
  "status": "completed",
  "requested_count": 1,
  "succeeded_count": 1,
  "failed_count": 0,
  "outputs": [{
    "slot": 1,
    "asset_id": "asset_001",
    "output_id": "out_001",
    "attempt_id": "att_001",
    "gcs_uri": "gs://APPROVED_PRIVATE_ASSET_BUCKET/v1/outputs/users/u1_0123456789abcdef0123456789abcdef/requests/req_direct_001/slots/001-asset_001.png",
    "gcs_generation": "123456789",
    "mime_type": "image/png",
    "size_bytes": 900000,
    "width": 1024,
    "height": 1024,
    "sha256": "bce3110f5aab65ddda45d8cdebd7cedd692e26309f8c3c96af5c1c648ab2a2d1"
  }],
  "failed_slots": [],
  "enhanced_prompt": "A premium editorial product photograph",
  "applied_skills": [],
  "applied_guardrails": [],
  "usage": {"input_tokens": null, "output_tokens": null, "estimated_cost": null},
  "timings": {"total_ms": 144000}
}
```

This is a **schema fixture**, not proof the illustrated object exists. Real integration tests must use actual GCS generation/checksum. A failed direct call returns the **same envelope** with `status:"failed"`, `outputs:[]`, `succeeded_count:0`, `failed_count:1`, `failed_slots:[{slot:1,error_code:"model_refused",retryable:false}]`, `error:{code,message,retryable}`; a clarification result uses `status:"needs_clarification"`, empty outputs, zero paid invocations, and `clarification:{code:"clarification_required",question,required_inputs:[]}`. Both require dedicated fixtures `response.python_direct.failed.json` and `response.python_direct.needs_clarification.json`. `count>1` gets HTTP 400 `unsupported_execution_mode` from this local route only.

**Node route behavior:** NJS-LIVE-01 may call direct Python through an authenticated local developer test harness. Browser-facing `/api/personalization/execute` uses the **async 202/polling flow** for actual 1–10-image usage; it must not turn into a 270-second frontend proxy call. In unit tests the real client and mock must be validated against their **appropriate response modes**, not falsely required to return the same terminal status.

### 5.5B Typed callback event fixtures (all required; internal snake_case)

All callbacks include `{schema_version,event_id,request_id,job_id,event_type,lease_token,fencing_token}`; the authenticated Node endpoint verifies job ownership, event uniqueness, and the current fencing token before mutating state. The callback examples below are **contract examples**, not real logs. The lease token must never be written to user-visible responses or routine logs.

**`callback.attempt_started.json`:**

```json
{"schema_version":"1","event_id":"evt_att_started_001","request_id":"req_001","job_id":"job_001","event_type":"attempt_started","lease_token":"FIXTURE_ONLY_LEASE_TOKEN_001","fencing_token":7,"attempt_id":"att_001","retry_of_attempt_id":null,"started_at":"2026-10-26T09:00:00Z","planned_slots":[1,2]}
```

**`callback.slot_failed.json`:**

```json
{"schema_version":"1","event_id":"evt_slot_failed_001","request_id":"req_001","job_id":"job_001","event_type":"slot_failed","lease_token":"FIXTURE_ONLY_LEASE_TOKEN_001","fencing_token":7,"slot":3,"attempt_id":"att_002","error":{"code":"no_image_returned","message":"No usable image part was returned","retryable":false}}
```

**`callback.clarification_required.json`:**

```json
{"schema_version":"1","event_id":"evt_clarify_001","request_id":"req_001","job_id":"job_001","event_type":"clarification_required","lease_token":"FIXTURE_ONLY_LEASE_TOKEN_001","fencing_token":7,"clarification":{"code":"clarification_required","question":"Which product should be replaced?","required_inputs":["product"]},"model_invocation_count":0}
```

**`callback.attempt_finished.json`** must include `attempt_id`, `outcome` (`succeeded|failed|unknown`), `finished_at`, optional usage and `retry_of_attempt_id`. **`callback.output_saved.json`** includes reserved slot/output/asset IDs, exact GCS generation, real SHA-256 and source `attempt_id`. **`callback.job_finalized.json`** includes final public status, succeeded/failed slot counts and an event summary. For **all** event types Node must dedupe `event_id`, reject stale fencing tokens, validate identifiers and use GCS CAS. A local worker may use `FIXTURE_ONLY_LEASE_TOKEN_001` only inside test fixtures; deployed requests use real ephemeral claim tokens.

### 5.5C Mock versus real Python route selection (required for PY-03 and PY-LIVE-01)

**Two distinct server-owned selectors (neither is browser-controlled):**

- **Node:** `PERSONALIZATION_EXECUTION_MODE=mock|local_direct_smoke|local_async|deployed_async`. In Node `mock`, **NJS-03's in-process fake client** validates the request and returns the agreed HTTP 200 non-polling mock response; it **does not call Python, GCS or Vertex**. This Node mock mode is **local/test only**, forbidden at deployed startup. For `local_direct_smoke`, Node uses the **real HTTP Python client**; in `local_async` or `deployed_async`, Node creates a durable job and dispatches via the corresponding worker/queue. A configured real client never silently falls back to the Node fake after a failure.
- **Python:** `PYTHON_GENERATION_BACKEND=mock` or `PYTHON_GENERATION_BACKEND=vertex` is read at startup. Python `mock` is independently exercised by **PY-03 Python contract tests**, or by an explicit Node `local_direct_smoke` → real HTTP Python mock integration test. Python mock does **not** drive Node's in-process mock. Python `vertex` invokes the actual configured model. The Python mode is never accepted from a browser request or response-only `execution_mode` field.

For both services, absent/invalid mode is a startup configuration error; deployed services must use Node `deployed_async` and Python `vertex`, with local mock/test credentials disabled.

| Python setting | `/v1/generation/execute` | `/v1/generation/jobs/execute` | Credential and output behavior |
|---|---|---|---|
| `mock`, local development/test | Accepts valid `count=1..10`; responds immediately with HTTP 200, `execution_mode:mock`, `status:pending`, `outputs:[]`, `polling_allowed:false`, `status_url:null` | **Disabled (400 `unsupported_execution_mode`)** except specifically injected test harness fakes | No Vertex invocation, GCS object or live queued job; no polling |
| `vertex`, local | **Real direct smoke only, `count=1`**, full terminal result; count>1 => 400 `unsupported_execution_mode` | Real local asynchronous worker, 1..10 outputs after an authenticated dispatch | Verified local service credentials, ADC and actual private GCS objects |
| `vertex`, deployed Cloud Run | Direct smoke route **disabled** (404, or blocked by ingress/routing); worker is the only live generation entry point | Authenticated Cloud Tasks delivery, 1..10 outputs | Cloud Run IAM/OIDC and production service identities; mock is forbidden |

Configuration must fail closed if Python's mode is absent/invalid. **Node mode also fails closed when absent/invalid; never auto-select mock in production.** A development `mock` cannot silently change into `vertex`, or vice versa. Keep the underlying existing image-adapter (`BPS_*`) configuration distinct; `PYTHON_GENERATION_BACKEND=vertex` must still verify the actual Vertex image backend/model availability. Contract fixtures test mock and real-direct response schemas separately; the mock's apparent `pending` is a **terminal exchange for the mock test client**, not a job to poll.

### 5.5D Local service authentication (required for NJS-03/PY-03 direct smoke and LOCAL-ASYNC-01 async)

**Development-only mechanism chosen:** two **independent, high-entropy random 256-bit-equivalent opaque bearer tokens** exchanged in a single internal HTTP header `X-GCOS-Local-Service-Token`. Both services bind to `127.0.0.1`; the separate dispatcher is an explicitly started local process. This is a local-only substitute for Cloud Run IAM/OIDC, not an authentication design for production. Use a constant-time digest comparison (`timingSafeEqual` in Node, `hmac.compare_digest` in Python). Never log tokens, put them in contract fixtures, or expose them through Next.js.

| Direction and endpoints | Secret env name | Validator |
|---|---|---|
| Node direct client / local dispatcher -> Python `/v1/generation/execute` and `/v1/generation/jobs/execute` | `LOCAL_NODE_TO_PYTHON_TOKEN` | Python checks its local configured value and valid mode |
| Python worker -> Node `/internal/personalization/jobs/:jobId/payload`, `/claim`, `/events` | `LOCAL_PYTHON_TO_NODE_TOKEN` | Node checks its local configured value and valid mode |

Generate each token separately using `python -c "import secrets; print(secrets.token_urlsafe(32))"` and place it into **untracked** local environment files. The local Node dispatcher knows only the first token; Python has both; Node backend has both. The caller must supply `X-GCOS-Local-Service-Token: <value>`, and missing/wrong credentials receive 401 `internal_auth_failed`. The token alone is insufficient for object access: Node still checks job/reservation, current lease token/fence and permitted transitions. Test that a browser-facing route cannot access any `/internal/...` endpoint.

**Hard deployment guard:** if `NODE_ENV=production` or `K_SERVICE` is present (Node), or if Python detects a deployed Cloud Run runtime, **reject local-token authentication and refuse deployment when local-token variables are configured for active use**. Production uses Cloud Run IAM/OIDC verified service identity, including the Cloud Tasks invoker. Never support a fallback from failed OIDC to the local token. If a developer calls private Python Cloud Run through an authenticated `gcloud run services proxy`, the proxy handles Cloud identity; the local token must not be interpreted as a production credential. **Direct-mode ownership:** NJS-03 injects `LOCAL_NODE_TO_PYTHON_TOKEN` for every local real direct HTTP call, and PY-03 implements the constant-time check on `/v1/generation/execute` **before PY-LIVE-01 connects Vertex**; the authenticated CLI harness supplies the same local-only header. Missing/unset/wrong credential is 401 `internal_auth_failed`; Python must not accidentally accept an unprotected live direct route while LOCAL-ASYNC-01 is unfinished. LOCAL-ASYNC-01 adds worker dispatch and Python-to-Node callback token checks later. Tests cover legitimate CLI/Node calls, absent/malformed/wrong token, loopback-only binding and refusal of local tokens in deployed mode.

### 5.5E Worker/task, lease and callback fixtures (contract-complete examples)

**`request.worker_dispatch.json`** (Cloud Tasks body or local-dispatcher body to `POST /v1/generation/jobs/execute`; no prompt, owner namespace, output prefix or Skill content):

```json
{
  "schema_version": "1",
  "job_id": "job_001"
}
```

Worker verifies caller identity, fetches the full manifest from authenticated Node internal API, and claims the job. When a valid second delivery discovers an active lease held by another worker, it **does not generate**: it may acknowledge the duplicate with HTTP 200 `dispatch_status:already_running`, while operational reconciliation remains responsible for expired/stranded jobs. HTTP 200 for an actual completed delivery requires Node to have acknowledged the terminal event. **`response.worker_dispatch.finalized.json`**:

```json
{
  "schema_version": "1",
  "job_id": "job_001",
  "dispatch_status": "finalized"
}
```

**`response.worker_dispatch.already_running.json`** (HTTP 200 for a duplicate delivery that successfully verified another worker's live lease; does **not** mean the job has completed):

```json
{
  "schema_version": "1",
  "job_id": "job_001",
  "dispatch_status": "already_running"
}
```

**`request.claim.acquire.json`** (body of `POST /internal/personalization/jobs/job_001/claim`; sent only by an authenticated Python worker):

```json
{
  "schema_version": "1",
  "job_id": "job_001",
  "action": "acquire",
  "worker_instance_id": "local-worker-001",
  "lease_token": null,
  "fencing_token": null
}
```

**`response.claim.acquired.json`** (HTTP 200, private response, no browser exposure):

```json
{
  "schema_version": "1",
  "job_id": "job_001",
  "lease_token": "FIXTURE_ONLY_LEASE_TOKEN_001",
  "fencing_token": 7,
  "lease_expires_at": "2026-10-26T09:01:00Z",
  "renew_after_seconds": 20,
  "lease_duration_seconds": 60
}
```

**`request.claim.renew.json`** (every 20 seconds while active, same lease token and fence; server uses its own clock):

```json
{
  "schema_version": "1",
  "job_id": "job_001",
  "action": "renew",
  "worker_instance_id": "local-worker-001",
  "lease_token": "FIXTURE_ONLY_LEASE_TOKEN_001",
  "fencing_token": 7
}
```

Node checks the token digest and fencing counter, then updates GCS state using generation-match CAS and replies with the same response shape as `response.claim.acquired.json`, with a new `lease_expires_at`. A second claimant receives HTTP 409 `lease_held` until the **60-second lease plus 30-second observation interval** has elapsed. After that, Node may assign a strictly higher fencing counter after reconciliation checks. Fencing rejects callbacks and Node-authorized output manifest mutations from an outdated worker, but cannot guarantee an already-running external Gemini invocation has stopped.

**`callback.attempt_finished.json`** (normal authenticated Python -> Node callback):

```json
{
  "schema_version": "1",
  "event_id": "evt_att_finished_001",
  "request_id": "req_001",
  "job_id": "job_001",
  "event_type": "attempt_finished",
  "lease_token": "FIXTURE_ONLY_LEASE_TOKEN_001",
  "fencing_token": 7,
  "attempt_id": "att_001",
  "retry_of_attempt_id": null,
  "outcome": "succeeded",
  "finished_at": "2026-10-26T09:00:40Z",
  "usage": {"input_tokens": null, "output_tokens": null, "estimated_cost": null}
}
```

The valid `outcome` enum is `succeeded|failed|unknown`; unknown outcomes require reconciliation before any new paid invocation. Actual attempt identifiers are generated for **each real Gemini API call**, not for each requested image.

**`callback.job_finalized.json`** (the worker's proposed outcome, not permission to bypass Node verification):

```json
{
  "schema_version": "1",
  "event_id": "evt_job_final_001",
  "request_id": "req_001",
  "job_id": "job_001",
  "event_type": "job_finalized",
  "lease_token": "FIXTURE_ONLY_LEASE_TOKEN_001",
  "fencing_token": 7,
  "status": "partial_success",
  "requested_count": 3,
  "succeeded_count": 2,
  "failed_count": 1,
  "failed_slots": [{"slot": 3, "error_code": "no_image_returned", "retryable": false}],
  "finalized_at": "2026-10-26T09:00:50Z",
  "event_summary": {"attempt_started": 2, "attempt_finished": 2, "output_saved": 2, "slot_failed": 1}
}
```

Node responds success only after independently verifying reserved GCS output objects and slot counts and committing the terminal state via CAS. A stale callback cannot finalize a job. `needs_clarification` is allowed only with zero paid image invocations and an accompanying clarification event.

**`callback.lease_expired_or_stale.json`** (a **negative test request fixture**, not a success event; the test state has stored `fencing_token:7` so the incoming `fencing_token:6` must fail):

```json
{
  "schema_version": "1",
  "event_id": "evt_stale_001",
  "request_id": "req_001",
  "job_id": "job_001",
  "event_type": "attempt_finished",
  "lease_token": "FIXTURE_ONLY_OLD_TOKEN",
  "fencing_token": 6,
  "attempt_id": "att_stale_001",
  "retry_of_attempt_id": null,
  "outcome": "unknown",
  "finished_at": "2026-10-26T09:01:05Z"
}
```

**`errors.stale_worker_lease.json`** (HTTP 409 from Node):

```json
{
  "error": {
    "code": "stale_worker_lease",
    "message": "Worker lease expired or fencing token is no longer current",
    "details": [],
    "retryable": false
  },
  "request_id": "req_001"
}
```

For this fixture Node must leave the authoritative snapshot and manifest unchanged. Unit/integration tests must cover `lease_held`, `renew` after expiry, stale callback with a previously valid token, event ID replay, and concurrent claims. **The lease tokens in every fixture are obvious placeholders: they must never be accepted as production credentials.**

### 5.6 Final job response examples

**Partial success, count = 5** (Node's browser-safe view):

```json
{
  "schemaVersion": "1",
  "requestId": "req_001",
  "jobId": "job_001",
  "executionMode": "real",
  "status": "partial_success",
  "requestedCount": 5,
  "succeededCount": 3,
  "failedCount": 2,
  "outputs": [
    {"slot":1,"outputId":"out_101","assetId":"asset_101","previewUrl":"/api/assets/asset_101/content"},
    {"slot":2,"outputId":"out_102","assetId":"asset_102","previewUrl":"/api/assets/asset_102/content"},
    {"slot":3,"outputId":"out_103","assetId":"asset_103","previewUrl":"/api/assets/asset_103/content"}
  ],
  "failedSlots": [
    {"slot":4,"errorCode":"generation_failed","retryable":true},
    {"slot":5,"errorCode":"model_refused","retryable":false}
  ],
  "enhancedPrompt": "Premium studio lighting and product-focused composition",
  "appliedSkills": [],
  "appliedGuardrails": [{"id":"basic_image_safety","version":"1","outcome":"applied"}],
  "usage": {"inputTokens":null,"outputTokens":null,"estimatedCost":null},
  "timings": {"totalMs":123456}
}
```
No completed status with missing reserved objects. A full failure has `status:failed`, `outputs:[]`, structured error/failedSlots. For `needs_clarification` return `clarification:{code:"clarification_required",question,requiredInputs:[]}` and no paid image attempt; the user's answer submits a new idempotent request linked to the prior request when support is added.

**Mock response is a finished contract-test exchange, NOT a live pending job:** `HTTP 200`, `executionMode:"mock"`, `status:"pending"`, `outputs:[]`, `succeededCount:0`, `failedCount:0`, `pollingAllowed:false`, `statusUrl:null`, `message:"Mock accepted; image generation was not run"`. The frontend MUST stop polling (indeed, never start) when `executionMode=="mock"` or `pollingAllowed==false`, and display a clear mock/test notice. No public seventh `mocked` status, no fabricated GCS URI, and no mock GCS job that remains pending forever. A separately flagged preview fixture must use actual authorized test objects, not claim model execution.

### 5.7 Error contracts and agreed HTTP mapping

For **new personalization errors** (except login middleware errors), return:

```json
{
  "error": {"code": "integrity_error", "message": "Skill version failed SHA-256 validation", "details": [], "retryable": false},
  "request_id": "req_001"
}
```
Public browser adapter may map `request_id` to `requestId`, but contract fixtures must distinguish this from the internal Python format. **Existing sign-in middleware retains legacy** `{ "error": "token_expired", "message": "..." }` so old frontend proxy reauthentication remains functional.

| HTTP / job semantics | Code | Retryable and handling |
|---|---|---|
| 400 invalid body/unknown model operation/ratio | `validation_error` | false; Node public boundary 400; Python Pydantic 422 normalizes to 400 |
| 400 prompt > 8,000 Unicode characters | `prompt_too_long` | false |
| 400 too many images | `too_many_references` | false |
| 400 invalid image roles/duplicate exclusive role | `invalid_image_role` | false |
| 400 selected model can't accept references/settings | `model_input_limit_exceeded` / `unsupported_model_setting` / `unsupported_model` | false |
| 400 combined Skills or effective budget exceeded | `skill_context_limit_exceeded` | false |
| 400 required editing reference missing | `missing_main_image` | false |
| 400 unknown disabled operation/feature | `unsupported_operation` / `unsupported_input` | false |
| 400 real synchronous route with `count>1`, or async-worker route in mock mode | `unsupported_execution_mode` | false; select supported integration mode, do not silently downgrade image count |
| 401 legacy auth | `token_missing` / `token_expired` legacy string shape | sign in; don't change proxy |
| 401 invalid local internal service credential (development only) | `internal_auth_failed` | false; correct service configuration; no browser/internal fallback |
| 403 unsupported anonymous real execution | `identity_required` | false |
| 404 unauthorized/absent object, Skill, job or session | `asset_not_found`, `skill_not_found`, `job_not_found`, `session_not_found` | false; avoid enumeration |
| 410 owned previously available asset whose retention period has actually expired | `asset_expired` | false; **authenticate/authorize first**, return 404 for cross-user IDs to avoid enumeration |
| 409 user submission key with different payload | `idempotency_key_conflict` | false |
| 409 expired old key (must intentionally create fresh key) | `idempotency_key_expired` | false |
| 409 generation session closed | `session_closed` | false |
| 409 worker claim while another current lease is held (internal only) | `lease_held` | true **only for bounded job-coordination backoff**, never permission to duplicate a paid model call |
| 409 explicit slot retry with uncertain existing invocation/output | `retry_reconciliation_required` | false for client auto-retry; reconcile original outcome first |
| 409 different retry already active for that original failed slot | `retry_already_running` | false; show/poll the returned existing job reference |
| 409 stale/expired lease token or outdated fencing counter on claim, renewal or callback (internal only) | `stale_worker_lease` | false for stale worker; stop new paid calls, reconcile/claim through authorized flow |
| 409 GCS CAS conflict | `state_conflict` | safe internal reconcile only |
| 413 body/image upload too large | `payload_too_large` | false |
| 415 unsupported PNG/JPEG/WebP type | `unsupported_image_format` | false |
| 500 immutable Skill hash mismatch | `integrity_error` | false; stop before Python model call |
| 429 model/provider rate limiting | `upstream_rate_limited` | true with backoff; no unbounded retries |
| 502 invalid Python payload or service IAM failure | `upstream_invalid_response` / `upstream_auth_failed` | false until operator fix |
| 503 unavailable Python/Vertex/GCS or missing prod Python URL | `upstream_unavailable` / `storage_unavailable` | conditional retry after safe reconciliation |
| 504 transport timeout | `upstream_timeout` | no blind paid-generation retry |
| Job-level refusal | `model_refused` | false; do not fake an HTTP 200 successful image |
| Job-level no image part returned | `no_image_returned` | conditional; inspect cause before controlled retry |
| Job-level model failure | `generation_failed` | conditional by underlying provider code |
| Job-level GCS write failure | `output_save_failed` | retry only if no object or verified incomplete write |
| Job-level GCS validation mismatch | `output_verification_failed` | false until investigated |
| User clarification | `clarification_required` | **not failure**; `status:needs_clarification` and question |

**API error versus job failure:** an invalid submission returns 4xx/5xx API error, but accepted async work that subsequently fails is still retrieved with `GET /jobs/:id` HTTP 200 and `status:failed` plus a structured per-job error. `retryable` is **not** permission for blind automatic replay of uncertain model calls.

### 5.8 Contract fixtures required before either team merges

```text
docs/contracts/generation/v1/
  README.md                         # required/optional/nullable, version owner, compatibility
  openapi.yaml                      # optional initially; required before public release
  request.public.valid.json
  request.internal.valid.json
  request.internal.with_inputs.json
  request.internal.with_skills.json
  response.accepted.json
  response.completed.json
  response.partial_success.json
  response.failed.json
  response.needs_clarification.json
  response.mock.json                 # executionMode=mock, pollingAllowed=false, statusUrl=null
  response.python_direct.completed.json
  response.python_direct.failed.json
  response.python_direct.needs_clarification.json
  request.worker_dispatch.json
  response.worker_dispatch.finalized.json
  response.worker_dispatch.already_running.json
  request.claim.acquire.json
  response.claim.acquired.json
  request.claim.renew.json
  callback.attempt_started.json
  callback.slot_failed.json
  callback.clarification_required.json
  callback.output_saved.json
  callback.attempt_finished.json
  callback.job_finalized.json
  callback.lease_expired_or_stale.json
  response.local_async.accepted.json   # same camelCase HTTP 202 shape as §5.4
  response.local_async.terminal.json   # same camelCase HTTP 200 job status shape as §5.6
  state.index.job_owner.json         # immutable global job -> owner mapping (§4.1A)
  state.index.pending.json           # nonterminal marker (§4.1A)
  errors.validation.json
  errors.integrity_error.json
  errors.session_closed.json
  errors.clarification_required.json
  errors.output_save_failed.json
  errors.idempotency_key_conflict.json
  errors.unsupported_execution_mode.json
  errors.lease_held.json
  errors.stale_worker_lease.json
  errors.retry_reconciliation_required.json
  errors.retry_already_running.json
  errors.asset_expired.json
  errors.internal_auth_failed.json
  response.slot_retry.accepted.json
  request.slot_retry.json
  invalid/unknown_operation.json
  invalid/bad_output_count.json
  invalid/missing_node_id.json
  invalid/bad_image_role.json
  invalid/oversized_prompt.json
  invalid/invalid_model_setting.json
  invalid/nonempty_assets_before_feature_enabled.json
  invalid/skill_hash_mismatch.json
  invalid/direct_count_gt_one.json
  fixtures.sha256
```
Tests must load these exact fixtures in TypeScript and Python and assert acceptance/rejection, status enum, field naming and payload roundtrips. **`response.local_async.accepted.json` reuses §5.4 verbatim**, including `statusUrl` and `executionMode:real`. **`response.local_async.terminal.json` reuses §5.6's browser-safe terminal job envelope**, including reserved verified outputs and failed slots; no special second envelope is permitted. `state.index.job_owner.json` and `state.index.pending.json` are private Node/GCS storage fixtures and do not go to Python or the browser. Tests also assert that the internal handlers resolve a job from `job_id` without enumerating all users. No Zod on Node; use handwritten validation. No two independently editable contracts. Changes after approval require both technical leads' acceptance and updated fixtures.

---

## 6. Limits, model behavior, statuses and retry details

### 6.1 Application limits (approved)

| Limit | Value | Enforced by |
|---|---:|---|
| Output count | **1–10** | Node request and Python model planner |
| Actual image call concurrency per job | **2 default** | Python semaphore/config, can be reduced by quota |
| Input image count | **5 total** (<=1 `main_image`, up to 4 additional) | Node and Python |
| Individual image size | **10 MiB** | Node upload parser, Python GCS HEAD/read |
| Image resolution | **16 MP** maximum | Node image inspect, Python re-check |
| Input MIME | `image/png`, `image/jpeg`, `image/webp` | magic-byte validation; not filename only |
| Allowed image roles | `main_image`, `product`, `logo`, `style_reference`, `background_reference`, `general_reference` | both contracts |
| Skill count | **5** max | Node resolve, Python verify |
| Each Skill | **100 KiB**, `.md`, UTF-8 | Node upload |
| Combined selected Skills | **300 KiB** | Node and Python |
| Effective Skill instruction chars | **30,000** | Python, reject not silent truncate |
| Original prompt | **8,000 Unicode characters** | Node and Python (document codepoint/string rule identically) |
| Enhanced prompt | **16,000 Unicode characters** | Python; enforce true model token budget separately |
| Async job accept | **15 s** | Node submit-to-dispatch/worker acceptance only; no model execution in this window |
| Local direct smoke (`count=1`) | **270 s proposed** | Separate `PYTHON_DIRECT_TIMEOUT_MS`, developer/CLI only; NOT used for the frontend async flow |
| One Vertex invocation | **240 s** | Python timeout; do not blindly retry uncertain outcome |
| Job maximum | **25 minutes** | Node/Python durable deadlines |
| Frontend polling | **every 3–5 seconds** | FE; backoff when hidden; no busy loop |
| Frontend idempotency | **7 days** | Node GCS key reservation + server expiry |
| Deployed Cloud Tasks dispatch deadline | **29 minutes proposed** | Cloud Tasks, must be configured (default is shorter) |
| Python Cloud Run timeout | **30 minutes proposed** | Cloud Run, measured/reconciled |

**Model registry:** Python maps server-approved `model_id`/alias to an image-capable Vertex model available in the selected project/region. It records supported aspect ratios, image sizes/quality, thinking, temperature, grounding, reference limits and output-count behavior. Node/FE preserve current selected values but **reject unsupported settings clearly**; do not silently default unknown ratios or ignore model choices. The existing Create Image route's older fallback behavior stays unchanged under the OFF flag.

### 6.2 Actual attempts versus output count
- One `request_id` = one deliberate user Generate action (after idempotency coalescing).
- One `attempt_id` = one **actual API invocation of the configured image model**, including a timeout/refusal/error. One call may produce multiple images or none; do **not** assume `count=N` implies N calls.
- A retry creates a *new* attempt linked by `retry_of_attempt_id`; it stays under the original user request/job and **never reuses an attempt ID**.
- Every reserved output slot is at most one verified saved image for that job. `requestedCount`, `succeededCount`, `failedCount` derive from verified slot state, not number of invocation attempts.
- Automatic model retries are disabled initially except when a later explicit safe slot retry mechanism has proved reconciliation and cost controls. **User-initiated slot retry is defined in section 6.6** and creates a linked new request/job with fresh output IDs; it never regenerates successful slots.

### 6.3 Job statuses and applicability

| State | Allowed meaning | Terminal? |
|---|---|---|
| `pending` | durable job accepted, task dispatch or lease not started | no |
| `running` | Python claimed job, understanding and/or image execution running | no |
| `completed` | all N expected outputs stored and Node verified | yes |
| `partial_success` | 1..N-1 actual verified images and remaining slots terminal failed | yes |
| `failed` | zero saved outputs after terminal failure or request-wide failure | yes |
| `needs_clarification` | essential missing reference or contradictory instruction; structured question; **no paid image invocation** | terminal for this submission (linked new submission to answer) |

`unknown_or_reconcile` and `dispatch_pending` are **internal diagnostic fields**, not seventh/eighth public states. Mock `executionMode:mock,status:pending,pollingAllowed:false,statusUrl:null` is testing-only and **must never be polled** by the frontend; test exchange ends with its immediate HTTP 200 response. Permanent task error with an unconfirmed model outcome triggers human/automated **reconciliation before another paid attempt**.

### 6.4 Skills and guardrails detail

```json
{
  "applied_skills": [
    {"skill_id":"skill_premium","version":2,"selection_mode":"manual","outcome":"applied","reason_code":null},
    {"skill_id":"skill_background","version":1,"selection_mode":"manual","outcome":"skipped","reason_code":"not_applicable"},
    {"skill_id":"skill_unsafe_override","version":1,"selection_mode":"manual","outcome":"rejected","reason_code":"policy_conflict"}
  ]
}
```
Allowed outcomes `applied|skipped|rejected`; allowed reasons `not_applicable`, `duplicate`, `policy_conflict`, `unsupported_operation`, `skill_context_limit_exceeded`. Hash mismatch is a request failure `integrity_error`, not a benign skipped Skill. User-supplied Skill text is untrusted content; trusted guardrails are Python-owned, versioned, and cannot be replaced by uploaded Markdown. An automatically selected Skill can only be chosen from Node-authorized library metadata, then Node resolves approved version before Python applies content. Stage manual Skills first; automatic Skill matching is a separate issue.

### 6.5 Brand and Agent
- Multi-Brand user library in GCS; one optional selected `{brand_id,version}` per request, resolved/authorized by Node; `campaign_context` free-text only.
- **Exact Node → Python `brand` shape when non-null:**

```json
{
    "brand_id":"brand_001",
    "version":2,
    "sha256":"0000000000000000000000000000000000000000000000000000000000000000",
    "name":"Example Brand",
    "description":"Premium cosmetics",
    "art_direction":{
      "visual_style":"Minimal luxury",
      "color_palette":["#111111","#D6C4A6"],
      "tone":"Elegant and refined",
      "campaign_context":"Product launch art direction"
    },
    "constraints":{
      "must_preserve":["approved logo shape", "product silhouette"],
      "avoid":["altering legal text"]
    },
    "references":[
      {"asset_id":"asset_logo_001","role":"logo","gcs_uri":"gs://APPROVED_PRIVATE_ASSET_BUCKET/v1/inputs/users/u1_0123456789abcdef0123456789abcdef/assets/asset_logo_001/original.png","mime_type":"image/png"}
    ]
}
```

The all-zero hash above is a **syntactically valid placeholder, not a verified digest** in this illustrative snippet. Contract fixtures must use a real 64-character lowercase hex digest. Node authorizes/pins the Brand version and every reference asset before dispatch. Python validates content/size, does not treat brand text as system policy, and applies mandatory guardrails separately. `references` count toward the same **five-image total** (not five more). `brand:null` is valid. `campaign_context` is **not** a Campaign entity. Split NJS-09 into **NJS-09A Agents**, **NJS-09B Brands**, which **includes old NEW-05** explicitly.
- Agents pin exact Skill versions when saved. Skill picker FE design must be checked against `Luma_UI_UX_Screen.docx`; since reference comparison has not yet been completed, that design check is an **open acceptance gate**, not claimed done.
- Existing frontend panels survive. No ADK required to apply a basic Skill or prompt enhancement.

### 6.6 Explicit user retry for exactly one failed output slot

**Public API:** `POST /api/personalization/jobs/{originalJobId}/slots/{slot}/retry`. Body (camelCase):

```json
{"idempotencyKey":"NEW_UNIQUE_KEY_FOR_THIS_RETRY"}
```

Node validates the signed-in owner, that the original job is terminal `partial_success` or `failed`, that the selected slot failed with `retryable:true`, that its model outcome is **confirmed failed rather than uncertain**, and that no active retry for this original `{job_id,slot}` exists (GCS CAS claim). Python and Node reconcile any output object/events first. If uncertain, return **409 `retry_reconciliation_required`**; don't create another paid invocation. If another retry already exists, return its job if the idempotency key matches, otherwise **409 `retry_already_running`** with a safe job reference.

**Retry admission/index requirement:** Treat each accepted failed-slot retry as a normal *new async job*: create `v1/index/jobs/{child_job_id}.json` and `v1/index/pending/{child_job_id}.json` using exactly §4.1A's create-only conditions, owner validation, idempotency/CAS admission ordering, enqueue/recovery and terminal pending-marker cleanup. Never reuse the original job's indexes or resurrect its pending marker. If retry admission fails between objects, the normal GCS-02B orphan reconciler repairs or safely fails the child without invoking Gemini.

Each accepted **user-initiated retry** creates a **new request_id, job_id, output_id and asset_id** for **count=1**, with internal lineage `{parent_request_id,parent_job_id,original_slot,retry_of_failed_slot:true}`. It does **not** overwrite the original output slot or retroactively change the original terminal `partial_success`/`failed` job. The UI may group the recovered child output next to the original slot using the lineage link, marking its provenance. The new job has its own seven-day idempotency key; actual model invocations generate their own attempt IDs and `retry_of_attempt_id` references where applicable. User retries never regenerate successful slots and are subject to quota/cost checks.

Return `202` with a new job identity (or `200` for a terminal exact-key duplicate); `400` for non-failed slots, `404` for non-owned jobs/slots, `409` for conflict/unsafe uncertainty. Tests must cover duplicate click on retry, cross-user denial, stale failure, original partial success unchanged, recovery of a failed slot, and output reconciliation. **Initial release may display retry as disabled until the dedicated NJS-12/PY-12 workflow is implemented; do not advertise a working retry button prematurely.**

### 6.7 GCS retention, deletion and lifecycle defaults (proposed; require cloud/security approval)

**Authoritative last-use rule (v2.9):** Every successful **authorized** `GET /api/assets/:assetId/content` counts as an asset use and refreshes the owner-scoped asset manifest's `last_used_at` with a GCS generation-checked CAS write **at most once per 24 hours per asset**. Update before returning the binary stream if a touch is due; on a concurrent CAS conflict reread the manifest and retry/reconcile, and never serve a tombstoned or expired object. Unauthorized fetches and 404s never touch the asset. The touch and cleanup must coordinate through the same CAS/tombstone state; no touch-on-every-pixel/load amplification. NJS-13 owns touch-on-read, not NJS-13-LITE's minimal content proxy.

**Honest browser-board limitation:** Browser-only `localStorage` boards cannot be counted as authoritative server-side references and do not create a permanent pin. A board that is never reopened may lose an image when the **proposed** 30-day inactivity window expires. Existing output nodes show `410 asset_expired` when that happens. Active jobs and explicit server-issued temporary holds block deletion; node undo/delete is local state and is **not** proof that the object can be deleted. Do not promise "never delete while a board needs the asset" until a separate authorized, server-side board-asset reference/pin feature exists. GCS creation-age lifecycle alone cannot implement last-use retention; a scheduled CAS-aware cleanup worker is needed. Retention approval is required before automatic deletions are enabled.


These concrete defaults eliminate undefined "approved policy" text, but they are **proposals**, not prior user-approved data retention commitments; deployment requires company security/privacy sign-off.

| Object type | Proposed dev retention | Policy/implementation |
|---|---|---|
| Uploaded reference inputs | **30 days after last use** | Stored in private asset bucket; extend as needed for long-lived boards; explicit user deletion/request is honored subject to organizational rules |
| Generated image outputs | **30 days after last use** | Protect active jobs, retry processing and explicit server-side holds; browser-only offline board references are not durable pins |
| Immutable request/job/attempt/event history | **90 days** | Allows reconciliation, debugging and incident tracking; no raw prompts in unnecessary logs |
| Idempotency eligibility | **7 days** | Same key+fingerprint returns original job/result during eligibility window |
| Idempotency key tombstones | **90 days** | After day 7, until deletion, replay gets `409 idempotency_key_expired`; after deletion no replay detection guarantee |
| Skill/Agent/Brand immutable versions | Until explicit delete / applicable retention policy | Soft-delete from picker first, preserve pinned versions while referenced by retained jobs, subject to required erasure |
| Execution artifacts / temporary files | **7 days**, unless referenced by job | Clean up failed/orphaned files after reconciliation |

**Important GCS limitation:** simple GCS lifecycle age rules are based on object creation time, **not "last use"**. To enforce 30 days after last use, Node must maintain a `last_used_at` metadata/catalog record and a scheduled authenticated deletion reconciler, rather than rely on a 30-day age-only lifecycle rule. If that reconciler is not yet built, use a conservative **30 days after object creation** only for explicitly ephemeral, unreferenced test objects, and do not claim last-use retention is enforced. GCS object versioning, soft delete, and any bucket-wide retention lock can make actual deletion later/blocked and must be inspected with the cloud administrator.

The node's asset proxy may return `410 asset_expired` (only after ownership has been checked) or a generic 404 where anti-enumeration is required. Do not delete an image with an active server-known job, slot retry, or explicit temporary hold. A browser-only node that is not actively accessing its image does not block expiry. Add this lifecycle/deletion work to GCS-01, NEW-01, NJS-13 and NJS-LEGACY-GCS, and validate security deletion requirements. This plan does not assume retention approval has already happened.

---

## 7. Decision 10 — integration ownership, approval process and quality gates

### 7.1 Single-accountability model (role-level proposal)

| Accountable role | Exact responsibility | Approval required |
|---|---|---|
| **Integration DRI — Node.js technical lead** | owns integration backlog, canonical contract directory and version pin, cross-repo compatibility, risk register, dependency gates, final merge checklist | signs every contract release and end-to-end gate |
| **Python technical lead** | owns Python API and execution semantics, capability registry, model-call/attempt accounting, Skill/guardrail behavior, Cloud Tasks worker | **mandatory co-approval** for schema/fixture changes and live production-enabling release |
| **Frontend lead** | owns existing canvas wiring, error/login compatibility, UX states, Skill picker design review, Playwright tests | signs frontend preview/login/zoom gates |
| **Cloud/IAM & security owner** | owns development project/buckets, service accounts, OIDC/Run Invoker/Tasks permissions, GCS retention and proxy security review | signs deployed access and isolation gates |
| **QA / test lead** | keeps shared E2E matrix and evidence ledger, captures typecheck/unit/Playwright and live smoke results | signs milestone completion evidence |
| **Product requester / product owner** | approves user-visible decisions, which model controls appear, explicit fallback choices, and staged rollout | signs UAT and decision changes |

**Names are intentionally unfilled** because the provided files do not establish which individual is the current lead. At kickoff, insert each role's real named owner into the contract README and GitHub epic. This is the only unfilled governance datum; responsibility by role is resolved now.

### 7.2 Contract governance
1. Canonical `docs/contracts/generation/v1/` lives initially in the **Node repo**; Python consumes a hash-pinned release or read-only synced copy.
2. Node DRI proposes fixture/shape change in PR; Python lead approves compatibility. Frontend lead approves any public camelCase shape/UX-visible status change.
3. Test fixtures are the executable contract: Node handwritten validators and Python Pydantic must accept/reject the same input examples; Node maps internal 422 validation to public 400.
4. Every merge PR declares: `contract_version`, `contract_commit`, `fixtures_sha256`, changed public fields, breaking-change assessment, backward-compatibility mode and rollout flag.
5. A contract change cannot be considered safe just because `schema_version` still reads `"1"`; required field removal, changed status semantics, or different nullable behavior need migration fixtures and both-team agreement.
6. If `gcos-api-contracts` repository is approved, migrate the single canonical master and pin Git tags in both repos; keep no two editable masters.

### 7.3 Mandatory acceptance gates — no premature 'done'

| Gate | Evidence required | Blocks |
|---|---|---|
| **G0 — Repo truth** | NJS-01 and PY-01 inventories with true code paths, effective Python version, model/project/region list and current frontend storage map | code touching undocumented modules |
| **G1 — Contract** | Same fixtures pass TS and Pydantic; count 1 and 10; null board/session; model settings, errors, idempotency, all six statuses and callback schema | first joint service integration |
| **G2 — Local mock** | Node 404 feature-off, auth checks, 400 validation, mock response with no fabricated image, real-client adapter mapping test, Python mock route; tests recorded | local real smoke |
| **G3 — Local real Gemini** | Stable verified owner subject, actual working Vertex model and region, 1, 3 and then 10 outputs in GCS, Node ownership/path/checksum verification, proxy renders actual image | frontend early milestone |
| **G4 — Canvas and features** | Existing Create Image old flag OFF regression passes; ON 1,3,10 requested images; partial failure states, refs/Skill picker/Brand approved designs and authorization | deployed limited rollout |
| **G5 — Deployed async** | Cloud Run IAM+OIDC, task auth, Node internal callback auth, GCS CAS/idempotency, repeated task deliveries, 25-min job deadline and timeout safety, recovery and missing-task reconciliation | production/deployed enablement |
| **G6 — Release** | Security-approved GCS/IAM, cross-user tests, proxy fail-closed, backend/FE/Python tests, Playwright at 50/100/150% zoom, flag OFF rollback test, named owner sign-offs | wider user access |

G3 is explicitly **before** long-term session/Agent/Brand completion, but after stable user identity and the minimum GCS reservation/manifest foundation. G5 is required for the **fully durable, deployed** 1–10 production path, not for a single local synchronous smoke.

### 7.4 Where tests run while CI is off
- **Node:** from `backend/`, run `npm test`, `npm run typecheck`, `npm run build`; supertest for new API routes and auth compatibility.
- **Frontend:** from `frontend/`, run `npm test`, `npm run typecheck`, `npm run build`, `npm run test:e2e` (Playwright under `frontend/e2e/`). Confirm current Playwright config/test data before assuming full suite passes. Canvas-specific manual/automated visual QA at **50%, 100%, 150% zoom**.
- **Python:** from Python repo, `python -m pytest` when test extras installed; contract fixtures, GCS mocks, callback events, actual model smoke under a gated integration-test marker.
- **Joint local:** frontend :3000, Express :4000, FastAPI :8000, dev GCS bucket and live model (for smoke only). Capture `request_id`, `job_id`, `attempt_id`, asset ID and GCS object generation in test evidence without logging tokens.
- **Deployed staging:** both private Cloud Run services + Cloud Tasks + GCS. Record Cloud Run revision IDs, queue ID, IAM principal identities (not secrets), task execution outcome, and an owner-checked preview.
- **Every PR:** attach exact executed commands, pass/fail logs, test fixtures hash, diff files, blockers, rollback notes. Tests are **not** claimed executed by merely writing this document.

### 7.5 Team integration handshake (one-page protocol)
1. Node and Python leads approve `generation/v1` fixtures and stable status/error conventions.
2. Each team implements own fake independently, without requiring the other's repository to run.
3. Start local Node+Python; verify real `create_image` with one image. Move to 3 then 10 outputs after slot handling is implemented, **without weakening count range promised by D1**.
4. Introduce asset reservations + GCS output writes; verify object exactly matches Node reservation and authenticated proxy shows it.
5. Wire existing canvas behind flag. Add image reference, Skills/guardrails, versioned Brand later via separate issues.
6. For deployed async, replace long blocking request with Node 202/Cloud Tasks/Python private worker/Node authenticated callbacks. Validate leases, retries and GCS recovery before deployed rollout.
7. DRI records signed release decision. The teams can **independently develop** against contract; only contract approval and live acceptance are cross-team gates.

---

## 8. Mapping from original draft backlog to this plan

**Purpose:** Reviewers should be able to look up every identifier in `gcos-integration-issues.md` and find where its work belongs; issues are not silently dropped.

### 8.1 Existing Node.js issue IDs

| Original | Current treatment / ID | Notes |
|---|---|---|
| NJS-01 | **NJS-01** inventory | Standalone docs-only PR |
| NJS-02 | **NJS-02** shared validated contract | count 1–10, async, output-target, six statuses, idempotency fields now explicit |
| NJS-03 | **NJS-03** mock/real Python client | local direct + deployed OIDC/Task dispatch adapters |
| NJS-04 | **NJS-04** authenticated generation submit | prompt-only first, jobs eventually `202`, feature first/auth second |
| NJS-04A | **NJS-04A** stable provider subject | required before any durable multi-user GCS records |
| NJS-05 | **NJS-05** generation session state | GCS CAS, separate from sign-in session |
| NJS-06 | **NJS-06** GCS input resolver | after asset upload/catalog `NEW-01` |
| NJS-07 | **NJS-07** versioned Markdown Skills | GCS immutable versions + 100KiB/5/300KiB/30k rules |
| NJS-08 | **NJS-08** selected Skill resolver | with FE-02 picker, Python PY-06 |
| NJS-09 | **NJS-09A** Agents; **NJS-09B** Brands | split per one-feature-per-issue rule |
| NJS-10 | **NJS-10** full Create Image personalization | early **FE-SMOKE-01** separated to prove real canvas first |
| NJS-11 | **NJS-11** request/attempt/output accounting | GCS, not BigQuery; consumes GCS-02A seven-day key records; accurate attempts/outputs |
| NJS-12 | **NJS-12** async job states/errors/reconciliation | Cloud Tasks + GCS CAS, six public statuses |
| NJS-13 | **NJS-13-LITE** preview, then **NJS-13** full catalog | Node authenticated proxy, no signed URLs |
| NJS-14 | **NJS-14** remove unused Firestore path | early after NJS-01 review; do not break old route |
| NJS-15 | **NJS-15** full E2E handoff | final acceptance gate, **not** first real test |

### 8.2 Existing Python issue IDs

| Original | Current treatment / ID | Notes |
|---|---|---|
| PY-01 | **PY-01** Python inventory | specifically isolate Campaign/Firestore reliance |
| PY-02 | **PY-02** Pydantic parity | same fixtures as Node, no second editable contract |
| PY-03 | **PY-03** mock endpoint | `execution_mode:mock,status:pending,outputs:[]` |
| PY-04 | **PY-04** campaign-free request/session context | nullable `session_id`, no Campaign runtime dependency |
| PY-05 | **PY-05** validated GCS image loading | 5 refs, roles, MIME, size, dimensions |
| PY-06 | **PY-06** Skill integrity/provenance/applicability | reasons/outcomes, trusted guardrails separate |
| PY-07 | **PY-07** mandatory guardrails | backend-owned policies, non-overridable |
| PY-08 | **PY-08** prompt understanding | enhance vague prompt, six-state clarification semantics |
| PY-09 | **PY-09** final prompt package | no Campaign object; preserve exact constraints |
| PY-10 | **PY-10** model capability and image operations | `create_image` first; 1–10 outputs; honest attempts |
| PY-11 | **PY-OUTPUT-01** reserved GCS output writing | original PY-11 retained as implementation alias |
| PY-12 | **PY-12** model-attempt and usage events | Python report, Node authoritative GCS state writer |
| PY-13 | **PY-13** private deployed Python with OIDC | **deployed** prerequisite, **not** local live blocker |
| PY-14 | **PY-14** isolate/remove old Campaign/Firestore code | guard legacy paths until unrelated callers migrated |
| PY-15 | **PY-15** Python acceptance and handoff | same versioned contract fixtures |

### 8.3 Original `NEW-*`, `SH-*` and newly added work

| Original | Current treatment / ID | Why |
|---|---|---|
| NEW-01 | **NEW-01** asset upload/catalog | GCS private input binary and Node-owned asset ID |
| NEW-02 | **FE-02** Skill picker | same frontend change, Luma reference still needs check |
| NEW-03 | **NEW-03** proxy authentication hardening | security gate before deployed rollout |
| NEW-04 | **NEW-04** explicit Cloud Run/Tasks timeouts | now covers worker and task dispatch deadlines |
| NEW-05 | **NJS-09B** Brand persistence | **explicitly merged**; no silent drop |
| SH-01 | **SH-01** single canonical contract | initial Node repo dir, Python pinned, joint signoff |
| SH-02 | **GCS-02A / GCS-02B** split Node GCS state adapter | GCS-02A = reservations/CAS/idempotency/asset manifests; GCS-02B = indexes, private APIs, leases/recovery |
| SH-03 | **GCS-01** GCS bucket, paths, IAM, proxy policy | signed URL dropped; authenticated proxy approved |
| SH-04 | **NJS-11 / PY-12** events and single writer | GCS history, **BigQuery not now** |
| SH-05 | **ASYNC-01 / ASYNC-02** Cloud Tasks dispatcher + Python worker | moved into deployed mandatory milestone, not a far-future nice-to-have |
| No original | **PY-LIVE-01** real standalone Vertex path | early actual image proof, no Campaign dependency |
| No original | **NJS-LIVE-01** local real Python connection | does not wait for PY-13; count=1 synchronous smoke only |
| No original | **LOCAL-ASYNC-01** local 202 job and separate worker | required before frontend 1–10 image test; no Cloud Tasks deployment needed |
| No original | **FE-SMOKE-01** minimal actual canvas preview | avoids waiting for full Skill/Brand feature |
| No original | **PY-SKILL-AUTO** automatic Skill matching | deferred after manual selection |
| No original | **FE-BRAND-01** Brand selection in Create Image | needed to apply saved Brand profile |
| No original | **NJS-LEGACY-GCS** old Create Image output migration | explicitly deferred; old route unchanged |

---
## 9. Detailed GitHub implementation backlog — shared sequence, separate repos

**v2.9 precedence:** Section 22 is the current correction register. This section 9 issue body and its `Depends on`, Implementation, Acceptance and test lines have been updated directly; historical version registers in sections 14-21 are audit records only and cannot override v2.9 assignments.

**Usage:** Each subsection is a one-feature assignment for Claude Code or one GitHub issue. Start from the existing repo and `CLAUDE.md`; do not invent file paths. New paths should be proposed in each PR and verified. For each issue include affected paths, typecheck/tests, actual results, and a rollback/feature flag note. The original Node NJS-02→03→04 dependent PR chain remains suitable as `[integration 1/3]…[3/3]`; the Python team develops its own parallel PRs. Dependencies are logical merge requirements, not instructions to block independent mock implementation.

**Claude handoff rule for every issue in this section:** Convert the issue into `.github/ISSUE_TEMPLATE/canvas-feature.md` shape before filing, using `N/A` where a backend issue has no screen/zoom. Copy **the whole issue**, including its existing Owner/Depends on/Implementation/Acceptance lines and the expanded handoff below, into a single GitHub issue or Claude Code task. Before editing: (1) read the checked-out repository's `CLAUDE.md`, (2) run `git status` and record the base commit, (3) confirm that every marked **existing** file actually exists, (4) review the pinned v1 fixture directory and this document's §3–§6 architecture, (5) identify prerequisite issues actually merged, and (6) state blockers rather than fabricating modules, model access or test results. **ADD/proposed paths are suggestions, not evidence that those files exist.** Make only the scoped changes; preserve legacy Create Image and sign-in behavior unless the issue explicitly requires a change. Follow the **test-and-handoff checklist** in each block. Run both Node package typechecks (`npx tsc --noEmit` from each package) and backend tests when affected; Python work should run the repository's actual supported-version test commands. For frontend changes, review relevant Luma screens first (comparison not already done) and test 50/100/150% zoom. Every PR must list tests **actually run** with output, actual changed files, contract fixture hash, security checks, rollback and remaining dependencies. **Do not mark any live GCP or Vertex test passed unless it ran.**

**Issue completion is a gate, not a promise:** all listed acceptance criteria must be proven in tests or explicitly flagged as blocked. Do not work on later issues simply because they appear nearby in this document. If contract changes are necessary, stop and request review by both leads before modifying the canonical fixtures.

### 9.0 Lean dependency contract — authoritative for every issue

**Definition:** `Depends on` lists only **code-level merge prerequisites**: an actual exported interface or state store that the issue must import/use when implemented. A **fixture dependency** is satisfied by a pinned SH-01 v1 contract and mocks; it must **not** force one team to wait for the other team's feature PR. An **integration/release gate** requires two independently developed features to work together and is verified in section 7/10, but is not a merge blocker for either feature.

**Current v2.9 dependency snapshot:** See the generated **complete issue dependency table below**. Historical 100/72/74 counts are previous-review snapshots, **not** authoritative for v2.9; one new isolated transport issue is added to prevent cloud/security sign-off from blocking local canvas work. All issue IDs below have one owner and are checked for missing dependencies and cycles. This reduction removes redundant transitive edges and premature cross-team/UI/deployment coupling; it **does not** remove verified user identity, Node-owned GCS reservations/idempotency, NJS-02 type parity, Python GCS writer prerequisites, GCS-02B lease/index ownership, local 1/3/10 execution, or final deployed security/E2E testing. The explicit NJS-02 edge on GCS-02B is deliberately retained to satisfy the reviewed contract requirement even though it is transitively present via GCS-02A.

**One owner per feature:** NEW-03-TRANSPORT owns binary proxy transport; NEW-03 owns deployed proxy authentication and security sign-off. GCS-02A creates output reservations, manifests and the seven-day idempotency service. GCS-02B creates index files, immutable event/CAS leases and all Node private `/payload`, `/claim`, `/events` routes. LOCAL-ASYNC-01 creates exactly one public `GET /api/personalization/jobs/:jobId` handler and local dispatch/worker integration; NJS-12 **extends** that handler and owns failed-slot retry. NJS-11 only projects request/attempt/output history. ASYNC-01 supplies only deployed Cloud Tasks enqueue; ASYNC-02 supplies only the deployed Python worker OIDC adapter.

**Minimal merge lanes (teams can develop in parallel):**

1. **Canonical contract & smoke:** SH-01; NJS-02/PY-02; GCS-01 and NJS-04A in parallel; Python PY-OUTPUT-01 → PY-LIVE-01; Node NJS-03 → NJS-04 and GCS-02A in parallel → NJS-LIVE-01. NJS-01/PY-01 inventories can proceed in parallel, but their findings are reviewed before sign-off. Live smoke is **count=1 CLI only**, not browser async.
2. **Local async + canvas:** GCS-02B can merge independently of NJS-04 public routes. Python PY-10 runs in parallel. LOCAL-ASYNC-01 integrates them with NJS-04 and owns first status GET. NJS-13-LITE image proxy can be built in parallel using a pre-existing real GCS test object. FE-SMOKE-01 merges after both local async and proxy work and proves 1/3/10 via authenticated canvas.
3. **References, Skills, Brand:** Python PY-05 / PY-06 / PY-07 / PY-08 are independently tested with pinned fixtures; Node NEW-01/NJS-06 and NJS-07/NJS-08/FE-02 are implemented separately. Full input/Skill E2E is tested at NJS-10 and NJS-15. NJS-09B can save text-only versioned Brand profiles early; **real Brand images require NEW-01** and the Brand UI/selection needs FE-BRAND-01 before final acceptance.
4. **Deployed and accounting:** ASYNC-01 Cloud Tasks producer and ASYNC-02 secured worker adapter are independently mergeable with fakes (the latter reuses LOCAL-ASYNC-01 worker). NJS-11 accounting and NJS-12 failed-slot retry can be built independently once their respective event/status foundation is ready. Deployed integration **must not** be enabled until ASYNC-01, ASYNC-02, PY-13, NEW-03 and §7 G5/G6 tests pass.

**Canonical v2.10 hard-dependency table** (51 issues; **82 direct merge edges**; verified no cycles or missing IDs). Acceptance/release gates are listed separately, so test coupling does not block independent PRs.

| Issue | Code-level merge prerequisites |
|---|---|
| `NJS-01` | None |
| `PY-01` | None |
| `SH-01` | None |
| `GCS-01` | None |
| `NJS-02` | `SH-01` |
| `PY-02` | `SH-01` |
| `PY-03` | `PY-02` |
| `NJS-03` | `NJS-02` |
| `NJS-04` | `NJS-03` |
| `NJS-04A` | None |
| `PY-04` | `PY-02` |
| `NEW-04` | None |
| `PY-OUTPUT-01` | `GCS-01`, `PY-02` |
| `PY-LIVE-01` | `PY-03`, `PY-04`, `PY-OUTPUT-01` |
| `PY-10` | `PY-LIVE-01` |
| `GCS-02A` | `GCS-01`, `NJS-02`, `NJS-04A` |
| `GCS-02B` | `GCS-02A`, `NJS-02` |
| `NJS-LIVE-01` | `NJS-04`, `PY-LIVE-01`, `GCS-02A` |
| `NEW-03-TRANSPORT` | None |
| `NJS-13-LITE` | `GCS-02A`, `NEW-03-TRANSPORT` |
| `LOCAL-ASYNC-01` | `GCS-02B`, `NJS-04`, `PY-10` |
| `FE-SMOKE-01` | `LOCAL-ASYNC-01`, `NJS-13-LITE` |
| `NEW-01` | `GCS-02A`, `NEW-03-TRANSPORT` |
| `NJS-06` | `NEW-01` |
| `PY-05` | `PY-02`, `GCS-01` |
| `NJS-05` | `GCS-02A` |
| `NJS-07` | `GCS-02A` |
| `FE-02` | `NJS-07` |
| `NJS-08` | `NJS-07` |
| `PY-06` | `PY-02` |
| `PY-07` | `PY-02` |
| `PY-08` | `PY-04` |
| `PY-09` | `PY-06`, `PY-07`, `PY-08` |
| `NJS-09A` | `NJS-07` |
| `NJS-09B` | `GCS-02A` |
| `FE-BRAND-01` | `NJS-09B` |
| `PY-SKILL-AUTO` | `PY-06`, `PY-08` |
| `NJS-10` | `FE-SMOKE-01`, `NJS-06`, `NJS-08`, `FE-02` |
| `ASYNC-01` | `GCS-02B`, `NJS-04` |
| `ASYNC-02` | `LOCAL-ASYNC-01`, `PY-13` |
| `NJS-11` | `GCS-02B` |
| `PY-12` | `PY-10` |
| `NJS-12` | `LOCAL-ASYNC-01` |
| `PY-13` | `GCS-01`, `NEW-04` |
| `NEW-03` | `NEW-03-TRANSPORT` |
| `NJS-13` | `NJS-13-LITE`, `GCS-02A` |
| `NJS-14` | `NJS-01` |
| `PY-14` | `PY-01`, `PY-LIVE-01` |
| `NJS-15` | `NJS-10`, `NJS-12`, `NJS-13`, `PY-15`, `NEW-03`, `ASYNC-01`, `ASYNC-02`, `NJS-09B`, `FE-BRAND-01`, `PY-09`, `NJS-11`, `PY-12` |
| `PY-15` | `PY-13`, `PY-12`, `PY-07` |
| `NJS-LEGACY-GCS` | `NJS-13` |

**Integration gates are not shortcuts:** NEW-03 security sign-off is mandatory before deployed personalization; NJS-15 runs fully coupled smoke/rollback tests. A local transport code merge is not an approval to enable cloud deployment.

**Explicit acceptance coupling, not merge dependencies:** `PY-05 ↔ NJS-06` for real reference image E2E; `PY-06 ↔ NJS-08/FE-02` for selected Skills; `NJS-09B/FE-BRAND-01 ↔ PY-09` for selected Brand; `ASYNC-01 ↔ ASYNC-02 ↔ PY-13` for deployed worker security; `NJS-11 ↔ PY-12` for real accounting events; `NJS-12 ↔ ASYNC-01` for deployed retry dispatch; `FE-SMOKE-01 ↔ PY-10` for 1/3/10 image results. An issue may merge with mocks, but **may not claim the coupled live gate passed** before both sides are implemented and tested.

### P0 — Repository truth and shared prerequisites

#### NJS-01 — Code inventory and integration ownership map
- **Owner:** Node. **Depends on:** none.
- **Implementation:** Audit Express routes, auth, health/Firestore probe, localStorage/IndexedDB, legacy variants, model controls and current file paths. Deliver `docs/integration/inventory.md` ONLY; no behavioral changes.
- **Acceptance:** Inventory exists and points only to real files; backend tests/types pass; diff contains documentation only.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — NJS-01 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Express app/middleware in backend/src/server.ts and backend/src/middleware/requireIdentity.ts; frontend canvas persistence in app/canvas/board/canvasPersistence.ts and frameImageStorage.ts; Firestore probe in backend/src/lib/firestore.ts.
- **Read, modify or add these files:** EDIT ONLY docs/integration/inventory.md (new documentation). Read backend/src/routes/{generate,assets,boards,session}.ts, frontend/src/api/canvas.api.ts, stores/skills.store.ts and agents.store.ts, and app/api/proxy/[...path]/route.ts. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Enumerate each backend route with auth requirement, inputs and response format
  2. enumerate all localStorage/IndexedDB keys with their real readers/writers
  3. trace image generation and variant fan-out
  4. document absent server-side board, asset, Skill and Brand persistence
  5. identify code paths for the new contract/client/worker
  6. draw a Node/Python ownership table
  7. document proxy binary corruption/header drops, in-memory bearer vs image URL loads, deployed IAP anonymous identity, current GCS_BUCKET_NAME, and job API split without modifying code;
  8. at PR base commit verify whether `@skill` mention handling from PRs #239/#240 is present and record its real path, syntax and legacy limits (`mentionContext.ts` if present). Distinguish the uploaded ZIP snapshot from newer `main` at `9251e34` reported by reviewer;
  9. record `.github/ISSUE_TEMPLATE/canvas-feature.md` fields required for Claude handoffs and the plan's new vs old mock behavior.
- **Specific tests, negative cases and acceptance evidence:**
  1. Check every named path exists in the checked-out commit
  2. no runtime source or package modification
  3. run existing backend tests and both TypeScript typechecks, record actual output
  4. compare inventories with PY-01 before SH-01.
- **Deliverable and cross-team handoff:** Commit the single Markdown inventory with commit hash/known gaps; do not open unrelated refactoring PRs.
- **PR and stop conditions:** Keep the scope to **NJS-01**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

**v2.8 mandatory Claude implementation addendum — NJS-01**

- **GitHub filing template:** Preserve all 51 v2.10 issue IDs and convert each final issue into the checked-out `.github/ISSUE_TEMPLATE/canvas-feature.md` shape: Screen IDs, user story, numbered acceptance criteria, UI states, zoom invariance, out-of-scope, definition-of-done. For backend-only issues, use `N/A — backend only` for visual fields while retaining exact commands/tests, owner, dependencies and cross-team handoff in the issue body. **Do not interpret this documentation step as creating GitHub issues.**
- **Mocks:** Record that legacy Create Image's existing no-Vertex-key placeholder behavior and the new personalization mock response are distinct. Document a scoped CLAUDE.md clarification in the future relevant change/PR (do not alter CLAUDE.md in NJS-01's docs-only PR): legacy mock can return placeholders; new personalization `executionMode:'mock'` returns no fictional completed images and `pollingAllowed:false`.
- **Current-main verification:** before claiming `@skill` support absent, inspect `mentionContext.ts` and `/generate/image` on the **actual current commit**, not only the uploaded ZIP snapshot; report PR #239/#240 if landed.


#### PY-01 — Review Python runtime, Campaign dependencies and reusable Vertex components
- **Owner:** Python. **Depends on:** none.
- **Implementation:** Inventory campaign dependencies, current `/healthz`, actual Python `>=3.13,<3.15` requirement, FastAPI routes, reusable VertexImageClient, model settings and GCS hooks.
- **Acceptance:** Provide `docs/integration/python-inventory.md` with exact code paths and a dependency-removal plan; baseline tests run.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — PY-01 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Python app/main.py, app/orchestrator/campaign_pipeline.py, app/features/execution/service.py, app/services/image_model_client.py, app/services/storage_client.py and app/core/config.py exist in the uploaded Python repository.
- **Read, modify or add these files:** ADD docs/integration/python-inventory.md; inspect existing `app/api/routes/*.py`, `app/schemas/*.py`, `app/services/{firestore_client,stage_store,image_model_client}.py` and `pyproject.toml`. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Trace /healthz and existing routers
  2. diagram Campaign/Firestore lookups that cannot be called from new standalone path
  3. map reusable VertexImageClient generation and model configuration
  4. find storage hooks, returned images and errors
  5. verify supported interpreter/dependencies using actual pyproject
  6. identify safe new router and contract insertion points.
- **Specific tests, negative cases and acceptance evidence:**
  1. Start app with supported Python and call /healthz
  2. run repo-native tests if present
  3. demonstrate inventory of every Campaign/Firestore import on the proposed path
  4. do not change behavior.
- **Deliverable and cross-team handoff:** Return file-path inventory and reusable-client call example to Node and SH-01, with known Vertex project/region prerequisites clearly marked unknown until tested.
- **PR and stop conditions:** Keep the scope to **PY-01**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### SH-01 — Publish one versioned shared contract and cross-repo fixtures
- **Owner:** Node DRI + Python lead. **Depends on:** none
- **Implementation:** Create canonical `docs/contracts/generation/v1/` master and exact fixtures/required-nullability tables; add SHA-256 manifest and Python pinned sync process.
- **Acceptance:** Both leads sign same revision/hash; no dual editable masters; v1 has 1–10, six statuses, async, output_target, callbacks.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — SH-01 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** One agreed schema exists in this document §5 but neither repository currently contains the complete fixture library.
- **Read, modify or add these files:** ADD canonical docs/contracts/generation/v1/README.md, examples, invalid/, fixtures.sha256; later tag a single shared gcos-api-contracts repo and sync pinned artifacts into the two codebases. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Copy field definitions for browser camelCase and Python snake_case, nullable fields, 1–10 output slots and six public states
  2. publish typed callback/lease/index and direct/async fixtures
  3. enforce consistent fixture owner_key regex
  4. mark local-direct no-index versus async dual-index
  5. record explicit technical co-approvals
  6. update one fixture manifest hash after any modification.
- **Specific tests, negative cases and acceptance evidence:**
  1. Run JSON parse over every JSON fixture
  2. validate invalid fixtures are intentionally rejected by both Node and Pydantic suites
  3. compare pinned bytes/hash across repos
  4. enforce contract upgrade/compatibility rule before any merge.
- **Deliverable and cross-team handoff:** Publish one canonical version and the exact hash signed by Node DRI and Python lead, not two separately authored sets.
- **PR and stop conditions:** Keep the scope to **SH-01**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### GCS-01 — Provision private GCS buckets, IAM and retention policy
- **Owner:** Cloud admin + Node/Python. **Depends on:** none.
- **Implementation:** Use the existing `GCS_BUCKET_NAME` private **single dev bucket** with state/asset prefixes; optionally provision separate state/asset buckets later with explicit config and IAM verification. Configure ADC access, service accounts, approved region and lifecycle.
- **Review correction:** Document proposed 30-day inputs/outputs, 90-day history/key tombstones, 7-day temporary artifact cleanup, live references, delete rights and organization sign-off; do not misstate creation-age lifecycle rules as last-use retention.
- **Acceptance:** Read/write/create-only IAM tests pass; Node and Python identities cannot exceed intended access; bucket/project IDs documented, not guessed.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — GCS-01 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Backend has lib/gcs.ts but currently no persisted server-side assets or authoritative GCS job records.
- **Read, modify or add these files:** ADD infrastructure setup guide under docs/integration/gcs-setup.md (or infrastructure repo); edit backend/.env.example and Python .env.example only for documented variables. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Use existing `GCS_BUCKET_NAME` for one private dev bucket and map logical state and asset prefixes; decide two-bucket production separation only with a documented, implemented, tested environment-variable migration
  2. create or verify the approved private development bucket with public-access prevention and uniform bucket-level IAM; optionally create separate secured buckets after implementation
  3. grant Node exclusive authoritative state write, Python approved image read/output create
  4. record HMAC Secret Manager access for Node
  5. document Cloud Tasks identity/permissions separately
  6. establish retention proposals as approval-gated
  7. test upload/read/CAS/delete from each actual service identity.
- **Specific tests, negative cases and acceptance evidence:**
  1. No public ACLs/signed preview URLs
  2. GCS generation precondition 0 and CAS 412 behavior tested
  3. Python cannot overwrite authoritative state
  4. cross-user isolation enforced by Node, not prefix alone
  5. retention not activated without approval.
- **Deliverable and cross-team handoff:** Provide sanitized project/bucket IDs, service identities, IAM test logs and documented unresolved cloud/security approvals.
- **PR and stop conditions:** Keep the scope to **GCS-01**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

**v2.8 mandatory Claude implementation addendum — GCS-01**

- **Repository-compatible bucket configuration:** Current Node code/health uses only `GCS_BUCKET_NAME`; use this as the **single private dev bucket** first. Keep authoritative state under `v1/index/` and `v1/users/`; keep binary objects under `v1/inputs/` and `v1/outputs/`; prefixes are not IAM enforcement boundaries. Do not assume separately named `STATE_BUCKET`/`ASSET_BUCKET` environment variables exist. For a later secured two-bucket deployment, introduce explicit `GCS_STATE_BUCKET_NAME` and `GCS_ASSET_BUCKET_NAME` with documented precedence/fallback and update `backend/src/lib/gcs.ts`, `/api/health`, the Python output-writer configuration, .env.example, IAM and deployment docs in this issue.
- **Health/test behavior:** Health must probe the actual configured bucket(s), should not falsely report GCS healthy when no permissions exist, and must preserve legacy startup/fallback behavior where required. Unit tests cover default single-bucket dev, separate-bucket opt-in, missing env and private-object access, plus service-account IAM review. Retention proposals still require organizational approval.


### P1 — Contract, mock clients and stable user identity

#### NJS-02 — Define TypeScript v1 contract, handwritten validation and fixtures
- **Owner:** Node. **Depends on:** SH-01.
- **Implementation:** Implement TS public/internal types in `backend/src/contracts/generationV1.ts`, handwritten validators, camelCase/snake_case conversion, error map, output slots and model limits. Extract private legacy ratios/variant constants without changing old route behavior.
- **Acceptance:** Every shared fixture accepted/rejected correctly; bad counts 0/11 and unknown settings get 400; no Zod; old generation tests unchanged.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — NJS-02 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Existing backend/src/common/validation.ts and backend/src/routes/generate.ts supply handwritten validation and private generation limits. CLAUDE.md forbids Zod.
- **Read, modify or add these files:** ADD backend/src/contracts/generationV1.ts and backend/src/common/generationLimits.ts; minimal EDIT backend/src/routes/generate.ts to import unchanged constants; ADD co-located tests reading canonical fixtures. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Define public and internal request types, success/partial/clarification/error envelopes and the non-polling mock response (`executionMode: "mock"`; `status: "pending"` is a test-only exchange, never a seventh status)
  2. implement strict handwritten runtime validators for 8k prompt, 1–10 images, 5 refs, Skill limits, mode limitations and brand
  3. convert camelCase↔snake_case without losing nullability
  4. Node always creates IDs and internal output_target
  5. encode direct-smoke no-index and async dual-index in docs
  6. keep legacy aspect-ratio fallback unchanged on its old route.
- **Specific tests, negative cases and acceptance evidence:**
  1. Valid fixture roundtrip
  2. invalid operation/count/mode/model/image/Skill rejected with agreed code
  3. exact owner regex enforced for internal storage fixture
  4. all existing generate route tests unchanged
  5. zero Zod/new validation dependencies.
- **Deliverable and cross-team handoff:** Deliver compiled TS interfaces, fixture-driven tests, documented contract hash and Python handoff for PY-02.
- **PR and stop conditions:** Keep the scope to **NJS-02**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### PY-02 — Implement Pydantic v1 contract matching the shared fixtures
- **Owner:** Python. **Depends on:** SH-01.
- **Implementation:** Implement Pydantic schema matching the exact committed fixture version and status/error/slot/callback forms; avoid Campaign requirements.
- **Acceptance:** Same valid/invalid fixtures as Node; session/board nullable; Python 422 mapping documented; 1–10 count accepted.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — PY-02 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Existing Python schemas live in `app/schemas/*.py` and FastAPI routers in `app/api/routes/*.py`; current forms are campaign-centered.
- **Read, modify or add these files:** ADD app/schemas/generation_v1.py and Pydantic validation tests; possible ADD app/api/routes/generation_v1.py in PY-03, not here. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Mirror every Node-to-Python internal field including output_target, output slots, lease tokens, event type discriminators, direct result and mock
  2. preserve null session/board
  3. implement role/mime/count/Skill validation and error mapping
  4. prohibit user-controlled output_target and owner_key at the public boundary
  5. keep Python 422 internal and map to public Node 400.
- **Specific tests, negative cases and acceptance evidence:**
  1. Run exact shared valid/invalid fixtures in Python
  2. verify casing and alias handling
  3. reject malformed tokens, unknown operations and unsupported mode
  4. record version hash and differences for co-sign rather than inventing fields.
- **Deliverable and cross-team handoff:** Publish matching schema/test output and contract-signoff PR for Node DRI.
- **PR and stop conditions:** Keep the scope to **PY-02**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### PY-03 — Implement mock FastAPI execution endpoint and non-polling mock response
- **Owner:** Python. **Depends on:** PY-02.
- **Implementation:** Implement `POST /v1/generation/execute` with server-side `PYTHON_GENERATION_BACKEND=mock` or `PYTHON_GENERATION_BACKEND=vertex` selection (see §5.5C). In `mock`, validate count=1..10 and return `execution_mode:mock,status:pending,outputs:[]` without a paid call; preserve `/healthz`. **This Python mock is for standalone Python tests or deliberate real-HTTP contract tests; Node's own `PERSONALIZATION_EXECUTION_MODE=mock` uses its in-process fake and makes no HTTP call.** Real `vertex` behavior is implemented in PY-LIVE-01; a browser-supplied `execution_mode` never switches the server setting. **Direct route security owned here:** validate the local Node-to-Python token with constant-time comparison on `/v1/generation/execute`, even in Python mock mode. Local-only and loopback-only; reject missing/wrong token with 401 `internal_auth_failed`, and reject local-token auth when deployed. LOCAL-ASYNC-01 adds only worker callbacks later.
- **Review correction:** Mock HTTP 200 response must explicitly include `polling_allowed:false` in Python serialization (converted to `pollingAllowed:false` for browser), a null status URL and a test-only message; it never schedules a job.
- **Acceptance:** No model calls/GCS fake assets in mock mode; count=1/3/10 mock validation; `polling_allowed:false`; mode switch is controlled only by Python deployment config; deployed mock startup rejected; fixtures pass; error mapping and authenticated internal contract tests ready. T48 direct-route token verification passes before any real Vertex call; no unauthenticated direct Python endpoint.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — PY-03 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Existing app/main.py mounts campaign routers and exposes /healthz; no standalone generation mock route exists.
- **Read, modify or add these files:** ADD app/api/routes/generation_v1.py, app/services/generation_mock.py and tests; EDIT app/main.py to mount new route without removing legacy. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Implement POST /v1/generation/execute using server-controlled `PYTHON_GENERATION_BACKEND=mock` or `PYTHON_GENERATION_BACKEND=vertex`
  2. in mock mode return 200, execution_mode=mock, pending, polling_allowed=false and status_url=null
  3. never fabricate GCS assets or invoke Gemini
  4. reject deployed mock startup and reject request-controlled backend selection
  5. provide required direct-mode contract fields and predictable validation errors.
- **Specific tests, negative cases and acceptance evidence:**
  1. Count 1/3/10 validation, no paid calls/no GCS writes in mock, missing/invalid mode handling, deployed guard test, /healthz unaffected, fixture byte/schema match.
- **Deliverable and cross-team handoff:** Provide local curl example and exact mock fixture for NJS-03; the Node in-process fake is a separate mechanism.
- **PR and stop conditions:** Keep the scope to **PY-03**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.
#### NJS-03 — Build real and fake Python clients with separate async/direct timeouts
- **Owner:** Node. **Depends on:** NJS-02.
- **Implementation:** Implement PersonalizationClient mock/real, strict environment selection, OIDC acquisition for deployed calls, 15s job-accept timeout and error normalization. **Own the exact edit to repository `CLAUDE.md` rule 3:** missing Vertex-key placeholder applies to legacy Create Image only; new personalization mock is explicitly selected and non-polling, and new live calls fail explicitly instead of falling back to placeholders. Before LOCAL-ASYNC-01, require local direct Node->Python service token. **Node `PERSONALIZATION_EXECUTION_MODE=mock` selects the in-process fake (never calls Python); `local_direct_smoke` selects the real HTTP client (Python independently chooses its `mock|vertex` behavior).** The Node mock is local/test only and fails deployed startup. Local real direct client uses loopback without Run token.
- **Review correction:** Two client modes: `local_direct_smoke` has 270s timeout with a count=1 terminal response; async acceptance stays at 15s; use explicit separate fixtures. Mock response disables polling.
- **Acceptance:** Feature OFF=404 via route; Node `mock` returns HTTP 200 non-polling without calling Python; `local_direct_smoke` calls Python HTTP, which may separately be configured as mock or vertex; configured real client never falls back to mock; mock no image success; Python 422 maps 400; missing prod URL=503; deployed mock startup rejected; existing Create Image untouched. **Updated acceptance:** Root `CLAUDE.md` rule 3 is edited/tested in this PR, legacy placeholder unchanged; local direct call with absent/wrong token is 401, valid token succeeds; token is never passed to browser/logs or enabled in deployed mode. T45/T48.

- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — NJS-03 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Existing backend config reads process.env directly; google-auth-library already installed; Next.js proxy contains an OIDC acquisition example.
- **Read, modify or add these files:** ADD backend/src/clients/pythonClient.ts, mockPythonClient.ts and their tests; EDIT backend/.env.example, docs/deployment.md and root `CLAUDE.md` rule 3 in this issue. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Implement one interface with strict mock/local_direct_smoke/local_async/deployed_async mode selection
  2. mock never performs HTTP
  3. local direct calls `/v1/generation/execute` with proposed 270s count=1 limit **and** `X-GCOS-Local-Service-Token` from ignored `LOCAL_NODE_TO_PYTHON_TOKEN`; never call Python's direct route without its verified local credential, even before LOCAL-ASYNC-01 lands.
  4. async accepted call has 15s timeout
  5. deployed requests acquire service OIDC and never forward user tokens
  6. normalize 422→400, timeout→504, malformed upstream→502, config missing→503
  7. validate responses against v1 and propagate request correlation.
- **Specific tests, negative cases and acceptance evidence:**
  1. Mock on/off/no URL
  2. real URL failure never falls back to fake
  3. timeout with one upstream call
  4. service token mocked and absent user cookies
  5. reject deployed mock and missing prod URL without crashing server
  6. direct count>1=400.
- **Deliverable and cross-team handoff:** Give route team typed client API and stable error/timeout mapping; avoid introducing a new env framework.
- **PR and stop conditions:** Keep the scope to **NJS-03**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### NJS-04 — Create feature-flagged authenticated personalization submission API
- **Owner:** Node. **Depends on:** NJS-03.
- **Implementation:** Implement authenticated `POST /api/personalization/execute` behind flag; flag check before auth, no anonymous real, Node-generated request ID and validated client idempotency key. In first mock slice reject unimplemented image/Skill inputs. **`local_direct_smoke` is CLI/test-harness-only, accepts `count=1` and rejects `count>1`; do not route the real browser canvas to a 270-second synchronous request.**
- **Acceptance:** Mock accepts valid count 1..10 without phantom output; invalid 400, flag 404, legacy token errors unchanged, production URL missing returns only this endpoint 503.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — NJS-04 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** backend/src/server.ts mounts existing Express routers; backend/src/middleware/requireIdentity.ts handles legacy login behavior.
- **Read, modify or add these files:** ADD backend/src/routes/personalization.ts and route tests; EDIT backend/src/server.ts for mounting and docs/.env as needed. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Check personalization feature flag before auth (off indistinguishable 404)
  2. enforce real verified identity for all paid calls and reject deployed anonymous
  3. validate browser inputs and idempotencyKey
  4. assign requestId
  5. branch to Node mock 200 nonpolling or local direct count=1 or async 202 paths according to mode; `local_direct_smoke` is solely for authenticated CLI/test harnesses, reject browser-canvas use and `count>1` (400 `unsupported_execution_mode`)
  6. reject input/Skill references until corresponding persistence issue lands
  7. normalize errors while preserving legacy auth errors.
- **Specific tests, negative cases and acceptance evidence:**
  1. T01/T02/T14/T23/T31
  2. flag off signed-in/out same 404
  3. mock count 1/3/10 never polls
  4. no arbitrary browser GS URI/owner ID/asset IDs
  5. no frontend modification or legacy generation regression.
- **Deliverable and cross-team handoff:** Expose public contract for FE-SMOKE; leave reservations and key replay to GCS-02A, async indexes/worker routes to GCS-02B, and dispatch to LOCAL-ASYNC-01/ASYNC-01.
- **PR and stop conditions:** Keep the scope to **NJS-04**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### NJS-04A — Introduce stable verified user subject and secret-backed owner key
- **Owner:** Node. **Depends on:** none
- **Implementation:** Migrate email-only JWT/identity to verified provider namespace+sub before cross-user durable data; old tokens intentionally expire/reauthenticate, and all ownership tests use stable subject.
- **Review correction:** Implement v1 HMAC-SHA256 owner key (issuer + NUL + verified sub), Secret Manager-backed 256-bit version-pinned key, and explicit rotation/migration plan; verify no owner path depends on raw email.
- **Acceptance:** No email-to-sub inference; Google ID token verified; two distinct subjects cannot read others’ assets/jobs; domain allowlist preserved.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — NJS-04A (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Current backend/src/middleware/requireIdentity.ts sets email-based identity; backend/src/lib/sessionToken.ts uses email-only JWT.
- **Read, modify or add these files:** EDIT requireIdentity.ts, sessionToken.ts, authService.ts, owner consumers in boardStore/jobStore and tests; ADD backend/src/lib/ownerKey.ts (proposed). New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Verify issuer and provider sub from a validated Google ID token
  2. issue signed session tokens containing issuer/sub/email
  3. require re-login for legacy email-only tokens
  4. calculate u1_ + first 32 lowercase hex of HMAC-SHA256(issuer NUL sub) using Node-only version-pinned 256-bit key
  5. load production key from Secret Manager
  6. never infer/accept client owner key or silently rotate
  7. keep domain allowlist and existing verified behavior.
- **Specific tests, negative cases and acceptance evidence:**
  1. T02/T20/T35/T37
  2. same issuer/sub deterministic 32 hex, different issuer or sub different key, old token expires, cross-user board/job denial, no secret logged/returned.
- **Deliverable and cross-team handoff:** Provide documented key rotation/dual-lookup migration, deployment secret setup and consumer migration checklist before creating owner-scoped GCS data.
- **PR and stop conditions:** Keep the scope to **NJS-04A**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

**v2.8 mandatory Claude implementation addendum — NJS-04A**

- **IAP blocker:** In deployed `AUTH_MODE=anonymous` + `IAP_PROTECTED=true`, the existing middleware reportedly labels every user `anonymous`. Until a separate verified IAP identity adapter exists, deny **real personalization execution, GCS user asset read/write and generation-job access** in that mode, even when the frontend itself is behind IAP. No shared `anonymous` `owner_key` for paid or durable user data. Local anonymous is only allowed with non-polling mock and must not access real GCS assets.
- **Future IAP mode (out of scope unless separately approved):** Verify the signed `x-goog-iap-jwt-assertion` with the expected audience, issuer and signature and derive issuer+stable `sub`. Reject spoofed headers and mismatched audiences. Preserve the verified OAuth login and domain allow-list, never key owned files off raw email, avoid automatic email-to-sub identity linking. Add two-user isolation tests and deployed anonymous-denial tests as mandatory acceptance criteria.


#### PY-04 — Create campaign-independent Python execution context
- **Owner:** Python. **Depends on:** PY-02.
- **Implementation:** Introduce session-independent execution context object; optional `session_id`, `board_id`, `node_id`, prompt and approved asset refs; do not load a Campaign in the new entry point.
- **Acceptance:** Direct prompt-only execution never invokes campaign/Firestore lookup; distinct existing campaign routes not silently broken.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — PY-04 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Python app/orchestrator/campaign_pipeline.py is Campaign-based; app/features/request_understanding and app/features/execution provide reusable components.
- **Read, modify or add these files:** ADD app/schemas/generation_context.py and app/services/generation_context.py (proposed); hook into new generation router. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Build independent context from Node-authored request_id, optional session/board/node, user prompt, allowed refs, Skills, model and output_target
  2. classify requested edit and preserved regions
  3. do not query Campaign or Firestore
  4. pass context to existing intent/model adapters via narrow interfaces
  5. isolate old routes.
- **Specific tests, negative cases and acceptance evidence:**
  1. Null session/board test, text-only request, model selection passthrough, no Campaign/Firestore mock calls, stable error when inputs unavailable.
- **Deliverable and cross-team handoff:** Provide context schema and a single demonstration call for PY-LIVE-01 and planner work.
- **PR and stop conditions:** Keep the scope to **PY-04**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### NEW-04 — Document and enforce model, Node, Cloud Run and Cloud Tasks deadlines
- **Owner:** Cloud/Node/Python. **Depends on:** none.
- **Implementation:** Set explicit frontend/backend/Python Cloud Run timeouts, per-call timeout 240s, job limit 25m, Cloud Tasks 29m dispatch budget and task rate config; measure real deployment.
- **Review correction:** Document separate 15-second async acceptance versus 270-second **local-direct count=1** timeout; deployed Cloud Run timeout and Cloud Tasks dispatch deadline must be verified independently.
- **Acceptance:** Document actual settings; deadline budget is internally consistent; default task 10m timeout is not accidentally used; no silent request cancellation assumptions.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — NEW-04 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Existing docs/deployment.md does not set all Cloud Run request timeouts; new async execution adds Cloud Tasks deadlines.
- **Read, modify or add these files:** EDIT docs/deployment.md; ADD docs/integration/timeout-budget.md (proposed); update env examples in both repos. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Document Node acceptance 15s, local direct 270s count=1, provider 240s per invocation, concurrency 2, job 25m, task dispatch 29m, Python Cloud Run 30m
  2. verify frontend/backend request timeouts and webhook return behavior
  3. ensure async 202 does not depend on the long direct timeout
  4. define alert/reconciliation on exceeded limits.
- **Specific tests, negative cases and acceptance evidence:**
  1. Record actually deployed service timeout/deadline settings, fake clock timeout tests, T17/T29/T30 and provider near-boundary example
  2. avoid assuming cloud defaults are unchanged.
- **Deliverable and cross-team handoff:** Deliver a single table of time budgets used by NJS-03, LOCAL-ASYNC-01 and PY-13.
- **PR and stop conditions:** Keep the scope to **NEW-04**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

### P2 — Early real image and canvas demonstration

**Canonical merge prerequisites:** Use **only the complete issue dependency table in §9.0**. That table is the single source of truth for PR ordering; do not create a second partial dependency table here. The first live smoke uses `PY-OUTPUT-01` and the token-protected `PY-03` route before `PY-LIVE-01`; `GCS-02A` enables the first Node reservation without requiring the async indexes in `GCS-02B`. The Python and Node tracks may progress in parallel wherever §9.0 permits.


#### PY-OUTPUT-01 — Save real images to reserved GCS output slots with checksums
- **Owner:** Python. **Depends on:** GCS-01, PY-02
- **Implementation:** Build and unit-test a reusable reserved-slot GCS image writer **before** the live Vertex endpoint. Accept fixture image bytes and an authorized Node-authored output reservation, create-only upload, and return checksum, dimensions, MIME, generation, slot and attempt ID. **Do not require a Vertex invocation or the live route in this issue.**
- **Acceptance:** Fixture PNG/JPEG/WebP bytes can be written to one or several reserved slots without any model call; no object outside `output_target`; no placeholder GCS URI; write failure yields `output_save_failed`; upload metadata matches actual GCS objects. PY-LIVE-01 integrates this component later.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — PY-OUTPUT-01 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Python app/services/storage_client.py exists; new output-target reservation is supplied by Node in the v1 contract.
- **Read, modify or add these files:** ADD app/services/output_storage.py and tests; reuse existing storage_client.py where suitable. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Receive only Node-reserved bucket/prefix, slot and asset ID
  2. re-check configured output bucket and allowed namespace
  3. convert model image bytes to validated PNG/JPEG/WebP with dimensions and SHA-256
  4. upload using ifGenerationMatch=0
  5. record object generation, size, actual MIME and attempt
  6. return a typed result consumed by PY-LIVE-01 direct serialization and LOCAL-ASYNC-01 worker callbacks (the route/callback plumbing is **not** built in this issue)
  7. verify existing objects during ambiguous retries rather than overwrite.
- **Specific tests, negative cases and acceptance evidence:**
  1. T03/T18/T21 with in-memory image-byte fixtures and mocked/authorized GCS destinations; **no Vertex credentials required**
  2. rejects unauthorized path/slot/bucket, GCS write conflict and mismatched checksum
  3. 0 images never completed
  4. no fake URI and no direct GCS state write
  5. Python module is importable and callable before the direct Vertex route exists.
- **Deliverable and cross-team handoff:** Hand the reusable upload API and verified metadata fixture to PY-LIVE-01, Node GCS-02A and NJS-13-LITE.
- **PR and stop conditions:** Keep the scope to **PY-OUTPUT-01**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### PY-LIVE-01 — Implement standalone direct Vertex create-image smoke endpoint
- **Owner:** Python. **Depends on:** PY-03, PY-04, PY-OUTPUT-01
- **Implementation:** Extend the **existing, local-token-protected route implemented by PY-03**, and implement the **real synchronous count=1 smoke path only** for `POST /v1/generation/execute`, reusing the Vertex adapter and model capability checks. Produce the exact terminal direct response; record the actual model invocation and GCS output using the **already implemented** PY-OUTPUT-01 reserved-slot writer; do not implement a second GCS uploader. **Do not implement or promise 3/10-image synchronous results in this issue.** Multi-output planning, concurrency=2 and 1/3/10 test coverage belong to PY-10 and LOCAL-ASYNC-01.
- **Review correction:** Define and test `response.python_direct.completed.json`, `.failed.json`, `.needs_clarification.json`; direct smoke only accepts count=1; multi-image local testing uses local async worker and callbacks.
- **Acceptance:** A verified supported model in the real project/region produces **one** image and a matching reserved GCS output for `count=1`; direct `count=3` and `count=10` both return `400 unsupported_execution_mode`. `count=1,3,10` with actual multi-output processing is verified in **LOCAL-ASYNC-01** after PY-10. No Campaign dependency; real model attempt is recorded separately from output count.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — PY-LIVE-01 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** `app/services/image_model_client.py` is reusable; the protected `POST /v1/generation/execute` router and local service-token checks are first introduced by **PY-03**; this issue extends that router to real Vertex execution without entering the Campaign pipeline.
- **Read, modify or add these files:** EDIT the existing PY-03 route `app/api/routes/generation_v1.py` (proposed path; verify actual file) while preserving its token verification; ADD `app/services/direct_image_smoke.py` (proposed) and focused model stub tests. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Verify PY-03 is merged and unauthorized calls are rejected; extend its protected `POST /v1/generation/execute` router with the `vertex` backend branch for `count=1` only; never register another route for the same path
  2. consume Node-approved `output_target` and actual model capabilities; before GCS-02A is available, isolated Python tests may use an **explicitly test-only** signed-off output reservation fixture scoped to the approved development bucket/prefix. Never accept an arbitrary browser-selected destination; the later NJS-LIVE-01 E2E test must use a real Node-issued reservation
  3. invoke existing VertexImageClient without Campaign
  4. call the reusable PY-OUTPUT-01 GCS uploader with the reserved single output slot; verify actual returned `gcs_generation`/SHA-256 and do not build another upload implementation
  5. return terminal completed/failed/needs_clarification per §5.5A
  6. preserve actual attempt ID and checksum
  7. do not create async global job/pending indexes or enqueue anything.
- **Specific tests, negative cases and acceptance evidence:**
  1. T29/T37: count=1 real verified GCS object and no global indexes
  2. count=3/10 400 unsupported_execution_mode
  3. actual model/region/config verified before claiming success
  4. no phantom GCS output on refusal.
- **Deliverable and cross-team handoff:** Provide redacted request/response and model/region proof to NJS-LIVE-01; confirm the PY-OUTPUT-01 GCS writer is merged before attempting this live test; multi-image execution is PY-10/LOCAL-ASYNC-01.
- **PR and stop conditions:** Keep the scope to **PY-LIVE-01**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### PY-10 — Implement model capability registry and 1–10 image planning
- **Owner:** Python. **Depends on:** PY-LIVE-01.
- **Implementation:** Record per-model supported aspect ratios/size/quality/thinking/temperature/grounding; enforce invalid settings; ensure output fanout/reuse matches provider response behavior.
- **Acceptance:** Unsupported setting fails predictably; no silent ignore or forced default; actual attempt count measured.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — PY-10 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Existing image_model_client.py/image_ops.py may expose only a subset of Gemini model controls; existing Express generate route supports richer model settings.
- **Read, modify or add these files:** ADD app/services/model_capabilities.py and tests, extend new execution planner without editing old Campaign paths. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Define allowlisted model aliases and per-model capabilities (aspect, image_size, quality, thinking, temperature, grounding, reference max)
  2. plan output slots count 1..10 with at most two concurrent actual provider invocations
  3. map returned image parts to free reservations
  4. count provider attempts separately from generated images
  5. fail unsupported control explicitly rather than silently discard it.
- **Specific tests, negative cases and acceptance evidence:**
  1. T03/T04/T22
  2. stub providers returning 0,1,2 parts
  3. count 1/3/10 with partial failure
  4. trace actual invocation IDs
  5. no unsupported parameter sent to Vertex.
- **Deliverable and cross-team handoff:** Publish verified model capability matrix for the approved project/region and a configuration procedure for the PY-LIVE-01 and LOCAL-ASYNC-01 executors. PY-OUTPUT-01 has already delivered the reusable, model-agnostic storage writer.
- **PR and stop conditions:** Keep the scope to **PY-10**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### GCS-02A — Implement minimal GCS CAS, reservations, asset manifests and seven-day idempotency
- **Owner:** Node.js. **Depends on:** GCS-01, NJS-02, NJS-04A. **Phase:** P2, before NJS-LIVE-01.
- **Objective:** Make one real prompt-only image reliably reserve, save and verify a Node-owned private GCS output without building the asynchronous job infrastructure. Supply one reusable, tested reservation and idempotency service to every later async handler.
- **Scope:** GCS create-only (`ifGenerationMatch=0`), generation-checked CAS, owner-scoped object key builders, Node-only output slot and `asset_id` reservations, authorized output manifests/verification, and seven-day idempotency records. A replay of the **same owner + key + canonical payload** returns the original job/result (202 if pending or running, 200 if terminal); conflicting payload returns `409 idempotency_key_conflict`. Maintain documented expiry/tombstone behavior and atomic reservation of IDs using GCS preconditions. Node is the authoritative writer.
- **Out of scope:** `v1/index/jobs/`, `v1/index/pending/`, the internal `/payload`, `/claim`, `/events` endpoints, leases, dispatcher, recovery scanner, status-polling GET handler, session CRUD, model execution, and all Cloud Tasks work. **No global indexes for the isolated `local_direct_smoke` count=1 path.**
- **Files to inspect:** existing `backend/src/lib/gcs.ts`, `backend/src/common/validation.ts`, `backend/src/server.ts`; read pinned NJS-02 shared fixtures and NJS-04A verified owner-key service.
- **Files to add (proposed):** `backend/src/services/gcsStateStore.ts`, `backend/src/services/outputReservationService.ts`, `backend/src/services/idempotencyService.ts`, `backend/src/services/assetManifestService.ts`, and focused unit/integration tests. Verify actual paths with the checked-out repo before modifying anything.

**Claude-ready implementation handoff — GCS-02A (mandatory issue body)**

1. Implement a small `StateObjectStore` interface for GCS create-only writes, read-with-generation, CAS update and precondition-checked delete. Provide deterministic in-memory fake for tests; production uses private GCS credentials only.
2. Build owner-scoped key functions. Verify `owner_key` conforms to `^u1_[0-9a-f]{32}$` and comes from NJS-04A's verified identity, not browser parameters.
3. Implement Node-generated request, job and output-asset IDs and exactly `count` reserved output destinations. For direct smoke `count=1`, reserve and verify in the authenticated caller context; create **neither** global job index.
4. Implement `reserveOrReplayIdempotentSubmission(owner, key, canonicalPayload)` using a canonical payload fingerprint and a GCS conditional-create reservation: identical replay yields original identity/result, changed payload yields 409. Cover races by rereading an existing object after precondition failure; never create a second job/task for a duplicate key. This service is fully functional now, not postponed to NJS-11.
5. Implement 7-day active protection with documented tombstone behavior through the proposed 90-day history policy. Ensure expired-key replay does not silently generate a new paid job with the same key. Return stable errors and expose reservation metadata required by GCS-02B.
6. Verify Python-written output objects against the exact reserved bucket/path/asset ID, actual object existence and metadata (MIME, bytes, checksum, generation). Only mark verified outputs as available. Do not expose arbitrary browser-provided `gs://` values.
7. Add an exported API and typed fixtures consumed by NJS-LIVE-01, GCS-02B, LOCAL-ASYNC-01, ASYNC-01 and NJS-12. Do not add worker routes or status-polling controllers here.

- **Acceptance criteria:** (a) Real direct count=1 reservation exists and output verification succeeds with authorized GCS objects; (b) no global owner/pending index exists for that direct request on success or failure; (c) same-key concurrent submissions return the identical request/job ID and never reserve duplicate slots; (d) mismatched payload gives 409; (e) 7-day boundary and expired-key behavior covered with a fake clock; (f) wrong owner/asset/path, corrupt object and CAS conflicts are rejected; (g) existing legacy image flow stays unchanged. Use T03/T04/**T13/T14/T15**/T20/T35 and direct-isolation part of T37 (idempotent replay while running/terminal, key mismatch, 7-day expiry).
- **Cross-team handoff:** Provide actual TS API names/signatures, generation-precondition examples, JSON fixtures, and a mock GCS store suitable for the Python team's writer and NJS-LIVE-01. Explicitly state which methods are imported by GCS-02B; no duplicate implementations.
- **PR evidence / stop conditions:** Attach exact changed file paths, dependency SHA, tests actually run and results, generated fixture checksums and rollback. Never mark a live GCP image test passed without running it. Merge **before NJS-LIVE-01**.

#### GCS-02B — Implement async job indexes, private routes, leases and recovery
- **Owner:** Node.js. **Depends on:** GCS-02A, NJS-02. **Phase:** P2, before LOCAL-ASYNC-01.
- **Objective:** Make 1–10-image accepted async jobs discoverable, claimable, safely updated and recoverable without scanning user folders or creating a second idempotency mechanism.
- **Scope:** create-once `v1/index/jobs/{job_id}.json` and `v1/index/pending/{job_id}.json`; owner lookup, paginated pending index scanner, staged admission and crash repair per section 4.1A, Node private `GET /internal/personalization/jobs/:jobId/payload`, `POST .../claim`, `POST .../events`, service-principal guard, 60-second lease / 20-second renewal / 30-second expiry grace, fencing, immutable callback events, CAS state projection, terminal marker deletion and orphan recovery.
- **Out of scope:** Node frontend-facing `GET /api/personalization/jobs/:jobId` (LOCAL-ASYNC-01), retry endpoint and full error mapping (NJS-12), idempotency key/fingerprint algorithm (GCS-02A), deployed Cloud Tasks producer (ASYNC-01), local dispatcher/token adapter (LOCAL-ASYNC-01), Python worker (LOCAL-ASYNC-01 and ASYNC-02).
- **Files to inspect:** exported GCS-02A adapter/services, `backend/src/server.ts`, current Node middleware, NJS-02 fixtures, section 4.1A and section 5.5E.
- **Files to add (proposed):** `backend/src/services/jobAdmissionService.ts`, `backend/src/services/jobLeaseService.ts`, `backend/src/services/jobReconciler.ts`, `backend/src/routes/internalPersonalization.ts`, service-principal verification interface and focused route/service tests. **Reuse** `gcsStateStore.ts` and `idempotencyService.ts` from GCS-02A; do not recreate them.

**Claude-ready implementation handoff — GCS-02B (mandatory issue body)**

1. Call GCS-02A's existing `reserveOrReplayIdempotentSubmission` for admission; if it reports a duplicate, return the original job/result without writing another index, scheduling another invocation or mutating output slots.
2. Implement the ordered, recoverable async admission of section 4.1A: durable key + IDs, create immutable owner index, create pending index, write authoritative owner-scoped job/request snapshots, mark admission ready by CAS, then allow dispatch. Return 202 only after a durable recoverable accepted job exists. Reuse the same sequence for failed-slot child retry jobs.
3. Implement global `job_id` lookup using the immutable owner index. Never scan users or trust a caller-supplied owner key. Paginate pending index scans and verify authoritative snapshots before claiming, dispatching or cleaning up.
4. Implement and **own all three actual Node internal routes**: `/payload`, `/claim`, `/events`. Register them in Express, validate the same NJS-02 contract, require a verified service principal (unit tests inject a verified principal) and fail closed if an adapter is not configured. LOCAL-ASYNC-01 later wires the local dev credential adapter; ASYNC-02 later wires deployed OIDC. This issue can merge independently of NJS-04 because its private routes are registered behind injected verified-service-principal guards and use the approved NJS-02 contract; NJS-04 is required only for the real public submission integration gate. Neither issue creates the endpoints.
5. Add durable 60-second lease acquisition, renewal every 20 seconds, observed-expiry grace 30 seconds, monotonic fencing and stale-callback rejection. Add immutable `event_id` dedupe and CAS projection. Do not promise provider-side exactly-once charging after uncertain failures.
6. Reconcile failures at every admission step (including enqueue errors), job crashes, stale/nonterminal markers, and terminal pending marker deletion with generation preconditions. Reconcile from the event ledger if a snapshot update fails. Include deterministic clock and crash injection tests.
7. Expose stable interfaces for LOCAL-ASYNC-01's separate dispatcher and status handler, ASYNC-01 Cloud Tasks producer, NJS-11 accounting projector, NJS-12 child retry flow; do not implement those features in this issue.

- **Acceptance criteria:** Node private payload/claim/events handlers accept only verified service identities; an unknown owner is resolved via `job_id` index; stale lease callbacks are 409; concurrent scanners don't make duplicate paid calls; crash at every intermediate state is safely recoverable; child retry gets both indexes; direct count=1 has neither index; pending marker is removed on terminal transition; all T16/T18/T19/T28/T32/T33/T34/T37 cases pass and are evidenced.
- **Cross-team handoff:** Provide the tested internal route fixtures, dependency pins and GCS service interfaces. LOCAL-ASYNC-01 and ASYNC-02 consume, not recreate, these routes; NJS-11 does not recreate callback dedupe or idempotency.
- **PR evidence / stop conditions:** Actual diff, test results, contract hash, mock and injected-principal security results, rollback. Do not merge while NJS-02 fixtures or GCS-02A exports are unresolved.

#### NJS-LIVE-01 — Verify local real Node-to-Python image-generation integration
- **Owner:** Node. **Depends on:** NJS-04, PY-LIVE-01, GCS-02A
- **Implementation:** Perform actual authenticated local direct call to FastAPI/Gemini; server creates output reservations, verifies GCS objects before success, and records correlation IDs. **Does not depend on PY-13.**
- **Acceptance:** Direct local Windows developer smoke passes with count=1, creates **no** `v1/index/jobs/` or `v1/index/pending/` objects and returns full terminal direct result; 3 and 10 are tested later via LOCAL-ASYNC-01; request ID unchanged; failed/unverified objects never called completed.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — NJS-LIVE-01 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** New personalization route and real client come from NJS-04/NJS-03; output writer from PY-OUTPUT-01 (must already work with fixture bytes), GCS provisioning from GCS-01, and reservation/verification from GCS-02A.
- **Read, modify or add these files:** EDIT backend/src/routes/personalization.ts or ADD backend/scripts/smokePersonalization.ts (proposed); add integration tests using actual Python service under explicitly gated live credentials. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Generate validated count=1 prompt and reserved asset from authenticated local user
  2. require merged PY-OUTPUT-01 and PY-LIVE-01, call Python Vertex direct, wait within separate 270s limit, verify the actual PY-OUTPUT-01 GCS object bytes/generation/checksum and terminal response
  3. correlate request/attempt IDs
  4. write owner-scoped request/output records only as needed
  5. **do not create v1/index/jobs or v1/index/pending and do not put it on dispatcher**
  6. show CLI result without depending on Next.js proxy timeout.
- **Specific tests, negative cases and acceptance evidence:**
  1. T29/T37: GCS verified one image, request ID preserved, both global indexes absent after success and error
  2. count>1 rejected in direct smoke
  3. deployed mode refuses untrusted direct smoke
  4. existing Create Image tests unchanged.
- **Deliverable and cross-team handoff:** Submit sanitized successful real sample if credentials are available; otherwise report blocked, not success. Hand verified output catalog field set to NJS-13-LITE.
- **PR and stop conditions:** Keep the scope to **NJS-LIVE-01**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### NEW-03-TRANSPORT — Implement binary-safe Next.js proxy transport independently of security release sign-off
- **Owner:** Frontend/Node transport. **Depends on:** none. **Phase:** P2; may merge after isolated transport tests without cloud/security release approval.
- **Objective:** Preserve upload/download bytes and response security/cache headers at `frontend/src/app/api/proxy/[...path]/route.ts` without changing existing user login or Cloud Run IAM semantics.
- **Existing files to inspect:** `frontend/src/app/api/proxy/[...path]/route.ts`, `frontend/src/api/canvas.api.ts`, and the current proxy route tests. **Proposed files:** a focused `proxy.binary.test.ts` alongside current route tests; verify actual paths on checkout.
- **Implementation steps for Claude:**
  1. Inspect request/response proxy handling and the auth spec. Make binary bodies pass as a stream or unmodified ArrayBuffer; do not use `req.text()` for image uploads. Preserve the exact request content type, including any multipart boundary, and handle cancellation and safe payload limits.
  2. Stream/forward image responses without transcoding. Preserve an explicit allowlist of `Content-Type`, correct `Content-Length`, `Content-Disposition`, `Cache-Control`, `ETag`, `X-Content-Type-Options` and supported `Set-Cookie` headers. Do not forward hop-by-hop headers or user-supplied trusted-identity headers.
  3. Keep existing verified-user forwarding and legacy `token_expired` behavior unchanged; do **not** implement token minting failure handling, raw-cookie identity hardening or IAM rollout here (those are NEW-03).
  4. Add byte-identity and header tests using PNG/JPEG/WebP and a deterministic 10 MiB binary fixture. Test bodyless GET, rejected oversized upload, cancellation and 401 passthrough without tampering.
- **Acceptance:** T39 binary portions pass: input/output SHA-256 match byte for byte, MIME/length/cache/nosniff headers survive, JSON requests and legacy errors still work, no auth logic was weakened. Frontend typecheck/tests pass and changed files remain in scope. **Security release sign-off is not required to merge this isolated transport fix** but is required before deployed personalization is enabled through NEW-03.
- **Out of scope:** User/session token policy, deployed OIDC/IAP hardening, GCS upload catalog and backend asset authorization, Konva Blob URLs.
- **Handoff:** NEW-01 consumes preserved uploads; NJS-13-LITE consumes preserved responses; NEW-03 independently adds fail-closed service authentication on top of this transport. Supply exact test commands, fixtures and results, diff, rollback, and current checkout commit.

#### NJS-13-LITE — Add authenticated output image proxy with owner verification
- **Owner:** Node. **Depends on:** GCS-02A, NEW-03-TRANSPORT
- **Implementation:** Implement a minimal authenticated owner-checked binary image proxy `GET /api/assets/:assetId/content` using reserved/verified output manifests.
- **Independent verification:** Build/test the proxy using one real approved GCS fixture object with a GCS-02A-authorized manifest; the PY-LIVE-01/NJS-LIVE-01 live-output integration is a later E2E gate, not a prerequisite for implementing the proxy.
- **Acceptance:** Cross-user or nonexistent ID 404; private GCS objects load through proxy; no signed URL or public ACL; checksum and exact path checked.
- **Transport acceptance:** NEW-03-TRANSPORT response-byte/header fixtures pass without waiting on NEW-03 cloud/security sign-off; T38/T39 image reads via authenticated fetch succeed. Local execution still requires verified user identity.

- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — NJS-13-LITE (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** backend/src/routes/assets.ts and services/assetService.ts exist as stubs; frontend image data historically comes from browser data URLs.
- **Read, modify or add these files:** EDIT backend/src/routes/assets.ts and services/assetService.ts; ADD backend/src/services/assetContentProxy.ts (proposed) and authentication tests. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Accept GET /api/assets/:assetId/content
  2. require verified user
  3. resolve asset ID to Node-owned GCS manifest and owner
  4. ensure object name is pre-reserved, file exists, generation/MIME/checksum match
  5. stream bytes with safe headers and bounded buffering
  6. never expose GCS URI, signed URL, owner key or raw token to browser
  7. handle expired/missing/corrupt object and abort cancellation safely.
- **Specific tests, negative cases and acceptance evidence:**
  1. T20/T25/T26: own asset served, other owner/nonexistent returns same 404 behavior, private bucket confirmed, bad metadata rejected, real output renders in image element
  2. no public GCS ACL.
- **Deliverable and cross-team handoff:** Document response headers/cache policy and provide asset URL to FE-SMOKE; asset catalogue CRUD is NJS-13 later.
- **PR and stop conditions:** Keep the scope to **NJS-13-LITE**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

**v2.8 mandatory Claude implementation addendum — NJS-13-LITE**

- **Dependency:** `NEW-03-TRANSPORT` provides tested binary-safe proxy and preserved response headers; `NEW-03` is the separate deployed-auth security gate, not a prerequisite for this local code merge. This issue owns **only** Express `GET /api/assets/:assetId/content`, asset validation and GCS object streaming. It does not implement another frontend proxy.
- **Access contract:** Use verified `requireIdentity`, stable owner key, and reserved GCS manifest to authorize every request. A `<img src>` must not be presumed authenticated because the browser's in-memory bearer token is absent; FE-SMOKE-01 performs the authenticated Blob fetch. Do **not** switch Express to unauthenticated `gcos_session` cookie parsing as a workaround.
- **Response:** `Content-Type` from verified magic bytes/manifest, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, safe `Content-Disposition: inline`, consistent abort handling; omit public GCS URI, owner keys and signed URLs. Test through **the actual Next.js proxy** that binary bytes and headers arrive unchanged and `401` handling is preserved. Explicit 404 for foreign/unknown asset IDs; expiration can surface as authorized 410 per v1 policy.


#### LOCAL-ASYNC-01 — Implement local durable 202 job dispatch and Python callbacks
- **Owner:** Node + Python. **Depends on:** GCS-02B, NJS-04, PY-10
- **Implementation:** Add local `POST /api/personalization/execute` async 202 and **implement/register the first owner-checked `GET /api/personalization/jobs/:jobId` in proposed `backend/src/routes/personalizationJobs.ts`** (verify actual path at implementation time) (not in NJS-12), plus a **separate explicitly started** development dispatcher/worker. The submit handler must reuse GCS-02A seven-day replay/conflict checks before GCS-02B indexed admission. NJS-12 later extends the existing GET route with complete errors and retry references without recreating it. The dispatcher scans the paginated `v1/index/pending/` markers through the Node GCS CAS adapter (then reads authoritative snapshots; it does not scan user folders or dispatch via a detached request thread), calls Python's worker path using a locally verifiable service identity, and processes the same payload/claim/event callbacks as Cloud Tasks. Reuse the 60-second lease, 20-second renewals and fencing rules. Keep the Cloud Tasks production implementation in ASYNC-01/02.
- **Local startup contract:** Introduce a documented backend script, **proposed** `backend/scripts/runLocalPersonalizationDispatcher.ts`, exposed via `npm run personalization:worker:local` **after implementation**. Do not run this nonexistent script before the issue lands; until then, use direct `count=1` smoke only. With the dispatcher running and **PY-10 merged**, run `count=1`, `3`, and `10` via authenticated API `202` and polling (frontend visual wiring arrives in FE-SMOKE-01). The dispatcher invokes Python with `X-GCOS-Local-Service-Token` set to `LOCAL_NODE_TO_PYTHON_TOKEN`; Python fetches payload/claims/sends events to Node using `LOCAL_PYTHON_TO_NODE_TOKEN`. Both 32-byte-random secrets are generated locally, injected via ignored dev env files, compared in constant time, restricted to loopback, and **rejected in deployed mode**. See §5.5D. Neither arbitrary user headers nor frontend session cookies are proof of internal service identity.
- **Acceptance:** Durable pending job survives Node restart; mock returns non-polling 200; index-driven dispatcher redrives `dispatch_pending` and clears stale terminal markers; real async job returns 202 within 15 seconds; local dispatcher and Python use **distinct, validated local service tokens**; missing/wrong token returns 401; local-token auth is not active when deployed; Python authenticated events update GCS; two dispatched copies do not start simultaneous paid invocations; failed lease renewal prevents new paid calls; real count=1,3,10 GCS outputs preview correctly.
- **PR evidence:** local worker start command, test results for 1/3/10, event fixtures, no browser long synchronous call, and explicit local-only auth scope.


**Claude-ready implementation handoff — LOCAL-ASYNC-01 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** No local personalization dispatcher exists; existing backend jobs are video-focused and in-memory.
- **Read, modify or add these files:** ADD `backend/src/routes/personalizationJobs.ts` (proposed first owner-checked GET status endpoint), `backend/scripts/runLocalPersonalizationDispatcher.ts` (proposed), `app/api/routes/generation_worker.py` and integration tests; EDIT `backend/package.json` to expose a worker command only after implementation. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Verify that GCS-02B owns and has already implemented Node private `/payload`, `/claim`, `/events` with verified-principal enforcement, and PY-10 implements 1/3/10 slot planning; submit async jobs as durable owner-scoped GCS records with both global indexes via GCS-02B
  2. Reuse GCS-02A's seven-day idempotency check for every submit. Implement/register `GET /api/personalization/jobs/:jobId` here with authenticated owner lookup via GCS-02B, the six statuses, bounded `outputs[]` and `failedSlots[]`, and a stable 200 status response; do not add the full NJS-12 error/retry policy. Return 202 within 15s for accepted jobs.
  3. run a separate local dispatcher that paginates `v1/index/pending`, checks authoritative snapshots, calls Python `/v1/generation/jobs/execute` using `X-GCOS-Local-Service-Token` (Node→Python secret), then Python invokes the **existing GCS-02B Node routes** using the separate Python→Node token; implement local credential adapter here, not new Node handlers
  4. validate loopback/deployed rejection and constant-time token checks
  5. Python reports per-slot events and Node projects them using CAS
  6. no post-response background thread.
- **Specific tests, negative cases and acceptance evidence:**
  1. T03/T04/T16/T28/T30/T32/T33/**T37**
  2. count=1,3,10, restart/replay, duplicate worker delivery, missing/wrong tokens, stale-fence 409, terminal cleanup, mock non-polling, orphan/crash recovery, same job ID lookup with no owner argument.
- **Deliverable and cross-team handoff:** Deliver two-terminal local start instructions, the first implemented owner-checked status GET endpoint and its tests, contract-captured 202/polling/event transcripts and successful GCS preview evidence. Keep Cloud Tasks in ASYNC-01/02.
- **PR and stop conditions:** Keep the scope to **LOCAL-ASYNC-01**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### FE-SMOKE-01 — Connect existing Create Image canvas to async personalization smoke
- **Owner:** Frontend. **Depends on:** LOCAL-ASYNC-01, NJS-13-LITE
- **Implementation:** Add minimal feature-flagged existing Create Image node integration to real Python path, status polling where available and output preview. Keep old path on OFF.
- **Review correction:** Frontend uses async 202/polling for count=1..10, never waits for local direct 270s call; mock executionMode stops polling immediately with an explicit test label.
- **Acceptance:** Prompt -> real GCS output displayed; errors and login expiry still work; no silent legacy fallback; 50/100/150% zoom pass.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — FE-SMOKE-01 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** frontend/src/app/canvas/components/NodePanel/kinds/imageKind.tsx uses generateImageV2; frontend/src/api/canvas.api.ts wraps the existing proxy.
- **Read, modify or add these files:** EDIT frontend/src/api/canvas.api.ts, imageKind.tsx and targeted UI tests; frontend auth-config feature handling as required. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Add a separate feature-flagged Create Image submission path using camelCase request, unique idempotency key per new action (enforced by GCS-02A even before NJS-11), count 1–10 and selected model settings
  2. handle 202 and poll GET job every 3–5 seconds
  3. stop polling for nonpolling mock 200, terminal states and unmount
  4. show real verified preview through Node proxy and partial failures
  5. preserve legacy imageKind behavior flag-off and show explicit message for unsupported reference/Skill before later issues land.
- **Specific tests, negative cases and acceptance evidence:**
  1. T01/T03/T04/T23/T25/T26/T31
  2. auth re-login still works, no silent model fallback, status UI at 50/100/150% zoom, mock zero polls, 10 outputs/partial cases
  3. network logs contain no Python URL or GS URI.
- **Deliverable and cross-team handoff:** Provide screenshots and Playwright trace; leave Skill-picker and Brand UI to their separate issues.
- **PR and stop conditions:** Keep the scope to **FE-SMOKE-01**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

**v2.8 mandatory Claude implementation addendum — FE-SMOKE-01**

- **Asset reference state (new, stable schema):** Persist a discriminated per-node record such as `{ kind:'gcs_asset', jobId, requestId, status, outputs:[{assetId,slot,mimeType,width,height}], pendingIdempotencyKey }`; keep the legacy `data_url`/IndexedDB representation unchanged while personalization is off. No Blob URLs, data URIs for new generated output, authentication tokens, GCS URIs or signed URLs in durable canvas state. Add versioned restoration/migration logic to the existing `canvasPersistence.ts` / `frameImageStorage.ts` and node output types (inspect current actual code first).
- **Authenticated renderer:** Add an `apiFetch`-style binary helper in `frontend/src/api/canvas.api.ts` using existing `getIdToken()`/session-expiry handling **without** its JSON-only default header for binary reads. Fetch `/api/proxy/assets/:assetId/content` with `Authorization: Bearer ...`, obtain a Blob, create an object URL, load it in Konva/HTML image; revoke on replacement/unmount after use. Handle 401 refresh/relogin, cross-user 404 and post-authorization 410 expired asset with non-broken placeholders.
- **Reload/recovery:** On 202 persist `jobId` + idempotency key immediately; on reload or reconnect authenticate and poll `getPersonalizationJob(jobId)` every 3–5s until terminal, with cancellation on unmount and no duplicate POST. If reply was lost before job ID, replay the **same** idempotency key and original payload (GCS-02A) rather than creating a new generation. Stop polls immediately for mock `executionMode:'mock', pollingAllowed:false`.
- **Canvas compatibility:** Change `imageKind.tsx`, affected node output/drag interactions (inspect `NodePanel.tsx` around the drag-out path) and download action to support `assetId` references. Undo/redo restores references; deleting a node removes only the reference, not the GCS object. Dragging between nodes carries `assetId` without downloading. Download uses authenticated binary fetch. Legacy Create Image reuse requires an explicit one-time authorized byte→legacy data URL conversion at the legacy boundary **only if** it fits that route's JSON request cap; otherwise show a clear incompatibility message, no silent fallback or truncation. Keep this within FE-SMOKE-01, not a new parallel canvas-state implementation.
- **Tests:** reload while job is pending; reload terminal node; repeat same request key after interrupted 202; revoke Blob URLs without blanking displayed images; drag to another node; download file matching GCS bytes; undo/delete/restore; owner denial; 30-day expiration state; 50/100/150% zoom; feature-off legacy data URL output regression. Add explicit T38/T41 evidence.


### P3 — Input assets and sessions (uses GCS-02A state primitives, and GCS-02B for async jobs)

#### NEW-01 — Add private GCS reference-image upload and asset catalog
- **Owner:** Node. **Depends on:** GCS-02A, NEW-03-TRANSPORT.
- **Implementation:** Add private PNG/JPEG/WebP input upload/asset catalog: 10MiB **per upload**,16MP, magic bytes, owner, Node asset ID, GCS create-only. Upload each file independently; five 10-MiB assets must not be sent as a single oversized multipart Cloud Run request. Upload legacy data URL on first personalization use, not bulk migrate.
- **Review correction:** Set proposed 30-day reference retention and pending-job protection; retention expiry/deletion requires cloud/security sign-off.
- **Acceptance:** Uploads get private `assetId`; unsupported formats/references rejected; cross-user retrieval denied; mock no-bucket mode documented as dev-only.
- **Transport acceptance:** The upload is binary-safe through NEW-03-TRANSPORT and may merge on byte-identity/unit tests without deployed security sign-off; NEW-03 remains a separate deployed release gate.

- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — NEW-01 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** backend/src/routes/assets.ts and services/assetService.ts currently do not store uploaded images; canvas has local data URL/IndexedDB inputs.
- **Read, modify or add these files:** EDIT routes/assets.ts and services/assetService.ts; ADD backend/src/services/assetUpload.ts and file-type validation tests. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Accept one image upload at a time, confirm magic bytes PNG/JPEG/WebP, max 10 MiB, max 16MP and user ownership
  2. preassign asset ID, GCS object name and immutable manifest
  3. upload create-only with hash/MIME/dimensions and retry-safe conflict check
  4. use verified stable owner key and private input bucket
  5. add browser-first-use migration for a single selected legacy data URL in its later UI issue, not bulk import.
- **Specific tests, negative cases and acceptance evidence:**
  1. T08/T09/T20
  2. boundary sizes, corrupt/polygot images, double upload, aborted transfer, another user asset ID, missing storage config and private ACL
  3. simulate GCS 412.
- **Deliverable and cross-team handoff:** Return {assetId,mimeType,width,height,sizeBytes} and a server-managed preview URL; never hand GCS object address to the browser.
- **PR and stop conditions:** Keep the scope to **NEW-01**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

**v2.8 mandatory Claude implementation addendum — NEW-01**

- **Dependency:** `NEW-03-TRANSPORT` owns the binary-safe Next.js proxy; `NEW-03` owns deployed authentication hardening and is a release gate, not this implementation prerequisite. Implement a **single-image** Node upload endpoint with documented method/path (canonical contract: `POST /api/assets`), not an unapproved second endpoint. Prefer raw `image/png`, `image/jpeg` or `image/webp` bytes per request; the frontend authenticated helper must not set `Content-Type: application/json` for binary submissions. Route-specific parser such as `express.raw({ type: ['image/png','image/jpeg','image/webp'], limit: '10mb' })` is acceptable when combined with strict decoded-byte size validation, image magic-byte sniffing, pixel count and MIME consistency. Evaluate error behavior when `express.json({limit:'10mb'})` is globally registered; correctly labeled binary requests should reach the upload handler unmodified. Avoid accidentally accepting oversized image bodies due to request header manipulation.
- **Checks:** Server-generated `assetId`, authenticated owner, create-only GCS object and manifest, private bucket; reject 10 MiB + 1 byte with 413, corrupted image, 16MP+ image, unsupported type with 415, and cross-user lookups. Test actual binary upload via frontend proxy: byte hash at browser fixture = byte hash received at Node = GCS checksum/digest record. Five images are five separate uploads, never one >10 MiB multipart blob. New preview/download uses NJS-13-LITE, not a signed URL.


#### NJS-06 — Resolve and authorize GCS inputs and reference roles
- **Owner:** Node. **Depends on:** NEW-01.
- **Implementation:** Resolve input `assetId` + one of six roles against Node catalog/GCS. Support max five images including one main; build trusted Python input refs; never trust browser `gs://`.
- **Acceptance:** Other-user image is 404; missing node/asset gives clear validation; size/dimension/role checks all pass; no base64 Node -> Python.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — NJS-06 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Existing frontend sends references as data URLs; asset catalogue will be introduced by NEW-01.
- **Read, modify or add these files:** EDIT personalization route/service; ADD backend/src/services/referenceResolver.ts (proposed) and ownership tests. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Accept only authorized asset IDs plus one of six fixed roles main_image/product/logo/style_reference/background_reference/general_reference
  2. enforce max one main, four other refs, five total, each ≤10MiB/16MP
  3. look up user-owned manifests and GCS existence before constructing internal Python input list
  4. reject caller gs:// URI or inline base64
  5. check selected model capability and report missing required main image for edit operations.
- **Specific tests, negative cases and acceptance evidence:**
  1. T08/T09/T10/T20/T21
  2. wrong-owner or unknown reference returns 404
  3. role cardinalities, missing object, metadata mismatch and configured input limits
  4. no untrusted object path forwarded.
- **Deliverable and cross-team handoff:** Publish exact `inputs[]` internal payload and error-code fixtures to PY-05.
- **PR and stop conditions:** Keep the scope to **NJS-06**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### PY-05 — Validate and load Node-authorized reference images in Python
- **Owner:** Python. **Depends on:** PY-02, GCS-01
- **Implementation:** Implement against the PY-02 shared input-role/GCS-reference fixtures and approved development GCS access. Load Node-authorized input objects, check expected owner-scoped input prefix, MIME, byte format, dimensions and per-model reference capability before call. **Do not wait for NJS-06 to merge**; joint E2E with real Node asset references waits for NJS-06.
- **Acceptance:** 5-image tests and each role pass; wrong bucket, corrupt image, unsupported count/format fail; no arbitrary GCS download.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — PY-05 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Python app/services/asset_service.py, storage_client.py, image_inspector.py can be considered for reuse after checking current interfaces.
- **Read, modify or add these files:** ADD app/services/reference_loader.py and tests; adapt new generator context input loading. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Consume only Node-resolved input entries and approved bucket/prefix
  2. check each GCS object exists and actual MIME/size/dimensions/bytes match, respect role enums and exclusive main image rules
  3. load at most five images efficiently without logging binary content
  4. account for model reference-image constraints
  5. return structured invalid_image/model_input_limit_exceeded errors when unsupported.
- **Specific tests, negative cases and acceptance evidence:**
  1. T08/T09/T10/T21
  2. valid all roles, corrupt PNG, oversized object, cross-bucket path, mismatched manifest, model max-image count and missing input
  3. no arbitrary browser-provided URI accepted.
- **Deliverable and cross-team handoff:** Provide verified reference objects and role mapping to PY-09/PY-10; document memory/time limits for large images.
- **PR and stop conditions:** Keep the scope to **PY-05**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### NJS-05 — Implement generation sessions using durable GCS CAS snapshots
- **Owner:** Node. **Depends on:** GCS-02A.
- **Implementation:** Create/resume/close `generation-sessions` with GCS CAS snapshots; a generation session is distinct from login. Session ID generated by Node, board IDs may remain unverified labels until boards are persisted.
- **Acceptance:** Closed session -> 409 session_closed; cross-user ID ->404; lazy first-use creation and resumable ID tested.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — NJS-05 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** backend/src/routes/session.ts handles login sessions; backend/src/lib/boardStore.ts is in memory and should not be assumed durable.
- **Read, modify or add these files:** ADD backend/src/routes/generationSessions.ts and services/generationSessionService.ts, GCS snapshot/ownership tests. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Define new /api/generation-sessions create/read/close/continue separate from sign-in refresh
  2. lazy-create on first request per board visit, server-generated sessionId and verified owner, board_id as untrusted label until persisted
  3. store versioned/CAS mutable session snapshot and append-only activity
  4. forbid new requests after close with 409 session_closed
  5. keep idempotency requests distinct from session identity.
- **Specific tests, negative cases and acceptance evidence:**
  1. T13/T20 and closed-session cases
  2. two-user isolation, concurrent closes, restart, stale session ID, old login refresh unchanged, board label not treated as authorization.
- **Deliverable and cross-team handoff:** Expose sessions lookup and lifecycle to frontend without introducing Campaign/Audience or BigQuery.
- **PR and stop conditions:** Keep the scope to **NJS-05**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

### P4 — Skills, guardrails, Agents, Brands and full canvas capabilities

#### NJS-07 — Implement immutable GCS-backed Markdown Skills and version pointers
- **Owner:** Node. **Depends on:** GCS-02A.
- **Implementation:** Implement saved `.md` Skills per user: immutable versions + sha256, latest CAS pointer, soft delete, 100KiB per file, 5 selected, 300KiB combined. Migrate existing localStorage with explicit user consent in a separate UI subtask if necessary.
- **Acceptance:** Version cannot overwrite; cross-browser same user sees saved Skill; invalid/oversized rejected; hash verifies; old versions traceable.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — NJS-07 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** frontend/src/app/canvas/skills/skillFile.ts already checks Markdown upload; frontend/src/store/skills.store.ts saves localStorage, with no server versioning.
- **Read, modify or add these files:** ADD backend/src/routes/skills.ts, services/skillService.ts and GCS version tests; EDIT Skills frontend store only within a scoped follow-on UI task or documented handoff. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Implement owner-authorized Skill CRUD with immutable .md versions and metadata JSON, max 100KiB each, strict UTF-8, integer version and SHA-256 integrity
  2. create latest pointer using GCS CAS
  3. soft-delete visibility while protecting pinned versions
  4. return sanitized IDs/versions/size
  5. plan opt-in one-time localStorage migration and explicit failure UX, not silent replacement.
- **Specific tests, negative cases and acceptance evidence:**
  1. T11/T12/T20
  2. edit creates v2 without touching v1, concurrent updates result in CAS conflict, wrong-user 404, hash tamper error 500, oversized/non-md/non-UTF8 rejected.
- **Deliverable and cross-team handoff:** Deliver stable Skill lookup API with sha256 and exact version resolver for NJS-08; user Skill is untrusted text, never policy.
- **PR and stop conditions:** Keep the scope to **NJS-07**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### FE-02 — Add a verified-design Skill picker to existing Create Image UI
- **Owner:** Frontend. **Depends on:** NJS-07.
- **Implementation:** Add Skill picker to existing Create Image panel, storing only **server-saved** Skill IDs. Keep `@skill` mention UX; detect Skills that exist only in the browser's `localStorage` (not yet persisted through NJS-07) and show **"Save this Skill first"** with a route to saved-Skills upload/import. Do not silently send browser-only Skill Markdown or bypass authorization. Verify design against `Luma_UI_UX_Screen.docx`.
- **Acceptance:** 1..5 selected Skills work; six rejected; per-node persistence, explicit errors, 50/100/150% zoom QA. A browser-only mentioned or picked Skill is blocked before Node/Python generation with the exact "Save this Skill first" affordance; legacy flag-OFF mentions remain unchanged. Test T42/T49.

- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — FE-02 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Existing frontend Skills library and `imageKind.tsx` exist; a **separate picker** is not yet confirmed, while a newer repo review reports existing `@skill` mention support. Verify current checked-out main before modifying either mechanism.
- **Read, modify or add these files:** EDIT frontend/src/app/canvas/components/NodePanel/kinds/imageKind.tsx, NodePanel UI/store config and tests; compare actual Luma_UI_UX_Screen.docx before approving design. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Verify IMG-02/IMG-03/SKILL-01 screen behavior, place multiselect without redesigning current Create Image panel
  2. list authorized saved Skills, show 0–5 selected, loading/empty/error/deleted states, persist selected skillIds in per-node config
  3. on submission resolve picker + `@skill` mentions to authorized **server-saved IDs only**; for an unsaved browser-only Skill, block the personalization call with "Save this Skill first", preserve user selection, and offer an explicit save/import action through NJS-07 (not silent content upload). Send IDs only after server confirmation.
  4. announce limit and application outcome, preserve canvas zoom and keyboard access.
- **Specific tests, negative cases and acceptance evidence:**
  1. T11/T23/T26
  2. selected 1/5/6 behavior, revoked Skill, stale node selection, no Markdown/hash sent by browser, legacy feature-off control behavior, screenshot at three zoom levels.
- **Deliverable and cross-team handoff:** Attach design comparison screenshot/notes and PR UX states; stop short of automatic Skill selection.
- **PR and stop conditions:** Keep the scope to **FE-02**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

**v2.8 mandatory Claude implementation addendum — FE-02**

- **Existing mention support:** The current reviewed main (`9251e34`) reportedly already supports `@skill` mentions via `mentionContext.ts`, with **legacy** 20-Skill/400-KB limits. Reconfirm exact implementation on checked-out branch before code change; replace the obsolete claim that image generation has no Skill-selection mechanism with: **there is no separate saved-Skill picker in Create Image, but @skill mentions are already supported in the legacy path**.
- **Single user experience:** Add the verified-design picker as an *additional* way to select saved Skills, not a replacement for `@skill`. Normalize each recognized mention to a canonical saved Skill ID where the UI has metadata; the frontend submits IDs only, never user-controlled Markdown or hashes. Keep recognized mention text and selected IDs consistent after edits/renames. Show clear combined-selection counts across mentions + picker and enforce the **new personalization** limit of 5 unique Skills; a sixth unique Skill returns a visible error, duplicates count once. Do not change legacy feature-off mention behavior/limits (20/400 KB) or existing Luma visual patterns.
- **Acceptance:** user selects 3 picker Skills plus 2 mention Skills; sees five distinct; six unique rejected; same Skill twice counts one; inaccessible/ambiguous name prompts a visible fix instead of silently dropping; switching personalization OFF preserves current mentions. Compare against `Luma_UI_UX_Screen.docx` before final UI sign-off.


#### NJS-08 — Resolve and pass authorized versioned Skills to Python
- **Owner:** Node. **Depends on:** NJS-07
- **Implementation:** Resolve selected Skill IDs to authorized latest immutable versions at request creation; verify UTF-8 SHA-256, 300KiB raw limit; send only server-verified content and provenance to Python.
- **Acceptance:** Hash mismatch ->500 integrity_error and no model invocation; other-user Skill 404; pinned version recorded; raw browser Markdown rejected.
- **Independent verification:** Consume saved Skill IDs through a test JSON fixture / authenticated API request; FE-02 supplies the picker later and is an end-to-end UI gate, not a backend merge prerequisite.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — NJS-08 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Saved Skills are currently client local; NJS-07 adds server versions and FE-02 adds user selection.
- **Read, modify or add these files:** ADD backend/src/services/selectedSkillResolver.ts and tests, EDIT personalization route internal payload assembly. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Resolve up to five selected skillIds under verified owner
  2. choose latest authorized version at request time for manually selected Skills
  3. fetch immutable Markdown from GCS and compare SHA-256
  4. enforce 300KiB raw and 30k effective characters with no silent truncation
  5. forward only server-resolved `{skill_id, version, sha256, content, selection_mode}` to Python; do not add an uncontracted `source` field (provenance is already represented by `selection_mode` and pinned Skill version)
  6. pin versions in request/job metadata
  7. reject missing/deleted/wrong-owner before invocation.
- **Specific tests, negative cases and acceptance evidence:**
  1. T11/T12/T20
  2. no-selected, one, five, sixth, stale version, hash mismatch, wrong-user Skill and combined budget
  3. Python not called on validation/integrity failure.
- **Deliverable and cross-team handoff:** Provide exact v1 skills[] fixtures to PY-06 and ensure resolved content cannot elevate trust level.
- **PR and stop conditions:** Keep the scope to **NJS-08**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

**v2.8 mandatory Claude implementation addendum — NJS-08**

- **Single selection/authorization owner:** Reuse existing `mentionContext.ts` parsing semantics where present (inspect the newer checkout; its concrete path is a reviewer report). At the **personalization** boundary, resolve both typed `@skill` mentions and picker `skillIds` into one de-duplicated list of verified owner-authorized Skill IDs, then pin and verify immutable saved versions. Handle ambiguous mention names with a deterministic `400 invalid_skill_reference`; unknown/deleted/foreign references must be rejected before calling Python. Do not trust raw browser-supplied Markdown, IDs implying ownership, or unspecified `source` payload field.
- **Contract:** Python still receives only `{skill_id,version,sha256,content,selection_mode}` for each of <=5 unique Skills; manual picker and mentions both use `selection_mode:'manual'`. Apply combined <=300 KiB raw and <=30,000 effective character budgets; unique Skill count is measured **after de-duplication**, and Python still enforces its own budget. Preserve original prompt for history while passing a cleaned execution prompt that doesn't accidentally reapply recognized `@skill` mentions as free-text instructions. Do not change legacy `/generate/image` 20/400 KB rule when flag OFF.
- **Tests:** 3 picker + 2 mention, duplicate ID counted once, 6th unique -> 400, renamed/ambiguous/unknown mention, wrong-user Skill, tampered hash -> `integrity_error` with zero Python calls, legacy mention regression. The FE-02 picker is an integration gate, not a hard merge prerequisite.


#### PY-06 — Verify Skill hashes, applicability and rejection reason codes
- **Owner:** Python. **Depends on:** PY-02
- **Implementation:** Implement from PY-02 pinned Skill fixtures independently of NJS-08/FE-02; the joint manual-Skill E2E gate waits for the Node resolver. Recalculate SHA-256 of received Skills, validate context limit 30k chars, decide `applied/skipped/rejected` with stable reason codes; treat Markdown as untrusted data.
- **Acceptance:** All reason codes fixture-tested; policy_conflict does not override guardrails; invalid hash blocks generation.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — PY-06 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Python app/features/skills/registry.py exists but its Campaign-oriented invocation must be adapted.
- **Read, modify or add these files:** ADD app/services/skill_application.py and tests; reuse registry where it does not assume Campaign. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Verify Node-provided SHA-256 against exact UTF-8 content, validate integer version and selection_mode
  2. classify each manual Skill applied/skipped/rejected with reason_code
  3. manual Skills are honored unless incompatible/policy-conflicting/over budget
  4. keep policies separate
  5. never interpret untrusted Markdown as system instructions
  6. emit actual applied_skills entries including version/outcome/reason_code.
- **Specific tests, negative cases and acceptance evidence:**
  1. T11/T12
  2. tampered content rejected, non-applicable Skill skipped with reason, policy conflict rejected, max-size enforcement
  3. no model call after integrity error.
- **Deliverable and cross-team handoff:** Return structured Skill audit data to prompt builder and Node while preserving pinned provenance.
- **PR and stop conditions:** Keep the scope to **PY-06**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### PY-07 — Enforce independent mandatory Python guardrails
- **Owner:** Python. **Depends on:** PY-02
- **Implementation:** Build/test the mandatory policy layer independently against PY-02 fixtures with a stub Skill provider; real Skill application is composed later in PY-09. Apply mandatory Python-owned guardrails separately from user-selected Skills: edit scope, logo/product preservation instructions, unsafe/unsupported instructions, output checks.
- **Acceptance:** User Skill cannot disable mandatory rules; applied_guardrails version/outcome returned; exact-pixel preservation not falsely guaranteed by a prompt.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — PY-07 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Existing Python app/features/validation/registry.py, deterministic_checks.py and semantic_checks.py provide reusable safety/validation points.
- **Read, modify or add these files:** ADD app/features/guardrails/policy_registry.py and policy_executor.py (proposed), plus tests. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Implement trusted backend mandatory policy versions independent of user-uploaded Skills
  2. enforce operation-dependent subject, product, logo and edit-scope safeguards, record {id,version,outcome}
  3. reject attempts to override via Skill content
  4. distinguish deterministic hard checks from model-guided soft checks and include output validation as required
  5. do not claim prompt-based logo lock is pixel-perfect.
- **Specific tests, negative cases and acceptance evidence:**
  1. T07/T12 and policy conflict tests
  2. malicious Skill override, logo preservation request, invalid operations and policy version logged
  3. no bypass on empty Skill list.
- **Deliverable and cross-team handoff:** Return policy decision and structured audit entries to PY-09/PY-12, with approved policy tests.
- **PR and stop conditions:** Keep the scope to **PY-07**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### PY-08 — Implement prompt understanding and clarification contract
- **Owner:** Python. **Depends on:** PY-04
- **Implementation:** Use the PY-04 context and approved clarification fixture; stub the guardrail policy interface so PY-07 and PY-08 can develop in parallel and PY-09 composes them. Add one bounded multimodal understanding/semantic-validation step; enhance vague but viable prompts and return `needs_clarification` only for essential missing data.
- **Acceptance:** Enhanced prompt <=16k; clarification yields requiredInputs and zero paid image calls; no fabricated user intent.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — PY-08 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Python app/features/request_understanding/intent_resolver.py and prompts.py already exist; current orchestration contains Campaign concepts.
- **Read, modify or add these files:** ADD app/services/prompt_understanding.py wrapper and tests around existing resolver. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Combine instruction understanding and semantic validation in one Gemini multimodal call when needed
  2. retain one 8k original prompt and 16k enhanced limit
  3. interpret requested changes/preserved entities
  4. only emit needs_clarification when information truly blocks safe execution
  5. produce specific question and required_inputs, no paid image call on clarification
  6. avoid unnecessary extra model calls and report measured latency.
- **Specific tests, negative cases and acceptance evidence:**
  1. T06/T07
  2. vague yet viable prompt gets enhanced, missing required product yields clarification, too long prompt 400, dangerous ambiguity remains deterministic rejection as appropriate.
- **Deliverable and cross-team handoff:** Publish typed enhancement/clarification structure to Node, PY-09 and frontend tests.
- **PR and stop conditions:** Keep the scope to **PY-08**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### PY-09 — Build a campaign-free final prompt package
- **Owner:** Python. **Depends on:** PY-06, PY-07, PY-08
- **Implementation:** Build final campaign-free prompt package from user instruction, authorized images, Skill versions, trusted guardrails and optional Brand text.
- **Acceptance:** Deterministic provenance returned; no duplicate Campaign dependency; rule precedence documented.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — PY-09 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Python app/features/prompt_package/package_builder.py and prompts.py exist but are linked to earlier campaign schema.
- **Read, modify or add these files:** ADD app/services/generation_prompt_builder.py or adapt existing builder for context-free route, with tests. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Build one final prompt package from original/enhanced prompt, verified inputs, manually selected Skills, optional pinned Brand and mandatory guardrails
  2. define precedence mandatory policy > requested edit scope > trusted user request > Skill/Brand style
  3. enforce effective instruction budgets, include exact output slots/model capability settings
  4. no Campaign/Audience lookup
  5. emit provenance and final prompt hash.
- **Specific tests, negative cases and acceptance evidence:**
  1. T06/T07/T11/T27
  2. empty Skill/Brand works, conflicts resolved with documented precedence, input roles preserved and 16k enhanced prompt enforced.
- **Deliverable and cross-team handoff:** Return generator-ready prompt with skill/policy/Brand audit refs for PY-10 and job event metadata.
- **PR and stop conditions:** Keep the scope to **PY-09**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### NJS-09A — Persist versioned Agents and pinned Skill references in GCS
- **Owner:** Node. **Depends on:** NJS-07
- **Implementation:** Version saved Agent configs in GCS; pin explicit Skill versions rather than silently following latest, preserve existing Agent UI behavior.
- **Acceptance:** Agents survive reload/another device; inaccessible other-user Agent 404; pin integrity and model config verified.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — NJS-09A (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** frontend/src/store/agents.store.ts stores Agents in localStorage and references Skills by ID only.
- **Read, modify or add these files:** ADD backend/src/routes/agents.ts and services/agentService.ts; EDIT relevant frontend Agent store in focused client change. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Store multiple immutable per-user Agent versions in GCS with active version pointer and CAS
  2. include instructions, approved model, explicit Skill ID+version pins
  3. verify ownership of referenced Skills at save and execution
  4. handle deleted or superseded Skills
  5. migrate legacy local store only with user consent
  6. preserve existing Agents page UI.
- **Specific tests, negative cases and acceptance evidence:**
  1. T20 and version tests
  2. two users isolated, save/edit/version conflict, pin to old Skill version still reproducible, no arbitrary foreign ID, reload/device persistence.
- **Deliverable and cross-team handoff:** Provide resolved Agent context contract for later generation integration; do not build new Agents planner in this issue.
- **PR and stop conditions:** Keep the scope to **NJS-09A**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### NJS-09B — Persist multiple versioned Brand profiles in GCS (includes NEW-05)
- **Owner:** Node. **Depends on:** GCS-02A
- **Implementation:** Implement multiple per-user versioned Brand configs in GCS, one optional selected per request; `campaign_context` is free text. Brand text/version persistence and a server-side authorized Brand-version resolver can be built with GCS-02A fixtures before NEW-01 lands; **reject any nonempty Brand image reference that cannot be authorized yet**. Export `resolveSelectedBrand(owner_key, brand_id)` (name illustrative) to authorize and pin the saved version/SHA-256 for FE-BRAND-01; never bypass asset checks. Real logo/reference uploads and their E2E Brand application are gated on NEW-01/NJS-06, not silently accepted. **Includes old NEW-05**.
- **Review correction:** Internal `brand` v1 shape must match section 6.5, including pinned integer version, exact JSON SHA-256, art direction, constraints and authorized reference-image assets.
- **Acceptance:** Brand survives reload/devices; CAS versioning; other-user 404; plain Create Image works without Brand.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — NJS-09B (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** frontend/src/store/brand.store.ts is currently in-memory; Brand components in frontend/src/app/canvas/components/Brand/BrandPage.tsx and ArtDirectionCard.tsx.
- **Read, modify or add these files:** ADD backend/src/routes/brands.ts and services/brandService.ts, GCS version tests; EDIT Brand frontend save/load in scoped follow-up. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Persist multiple Brand profiles per owner (one selected per request), immutable JSON versions/latest CAS
  2. preserve existing visual-style, color, tone and optional campaign_context as plain text, not Campaign entity
  3. store guideline/logo/reference images by authorized asset ID, not data URL
  4. support soft-delete, restore and explicit version pin
  5. merge original NEW-05 in this issue.
- **Specific tests, negative cases and acceptance evidence:**
  1. T20/T27
  2. user A/B isolation, v1→v2 old version retrievable, multiple Brands, only one active selected request Brand, references from GCS, reload/save error states.
- **Deliverable and cross-team handoff:** Publish exact pinned Brand shape to PY-09; do not claim Luma design comparison complete.
- **PR and stop conditions:** Keep the scope to **NJS-09B**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### FE-BRAND-01 — Add optional saved Brand selection to Create Image
- **Owner:** Frontend + Node.js integration. **Depends on:** NJS-09B.
- **Implementation:** Add optional one-Brand selection to existing Create Image node and forward only its authorized `brandId`; Node.js calls NJS-09B `resolveSelectedBrand` to pin/validate the version and construct the Python-facing `brand` context. Python PY-09 consumes that context. Do not silently accept a selected Brand if the Node resolver or Python Brand application is unavailable; report a clear unsupported-selection error until the full integration gate passes.
- **Acceptance:** No Brand required; selected Brand ID forwarded; UI works at 50/100/150% and has error states.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — FE-BRAND-01 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Existing Create Image panel imageKind.tsx and BrandPage.tsx exist; Brand selection is not wired to image generation.
- **Read, modify or add these files:** EDIT imageKind.tsx, relevant node configuration and API client tests after NJS-09B. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Add optional Brand selection sourced from authorized saved list, show brand name/version and none state
  2. persist selected brandId in node, send ID only; Node uses the NJS-09B authorized resolver to pin version and serialize the trusted internal Brand shape
  3. handle deletion/unavailable profile and data-loading failures
  4. display pinned version used on returned result
  5. preserve existing model/settings controls and accessibility.
- **Specific tests, negative cases and acceptance evidence:**
  1. T26/T27
  2. no Brand works, 2 Brands choose one, outdated selection error, selected v2 remains auditable, frontend sends no arbitrary Brand content or GCS URI.
- **Deliverable and cross-team handoff:** Deliver UI screenshots, authorized Node resolver wiring and Node-to-Python Brand fixture; live selected-Brand E2E is gated on PY-09. No Campaign picker.
- **PR and stop conditions:** Keep the scope to **FE-BRAND-01**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### PY-SKILL-AUTO — Add later automatic Skill suggestions with Node authorization
- **Owner:** Python + Node. **Depends on:** PY-06, PY-08.
- **Implementation:** Add later automatic Skill suggestions via metadata/understanding, but have Node authorize and resolve versions before Python consumes content.
- **Acceptance:** Auto-selector cannot invent/cross-user fetch Skills; selection_mode automatic recorded; manual selection priority defined.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — PY-SKILL-AUTO (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Python Skills registry exists; manual Skill resolution is implemented first by NJS-08/PY-06.
- **Read, modify or add these files:** ADD app/services/auto_skill_selector.py and tests; extend v1 contract only after both leads approve optional selector fields. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Select relevant Skill *IDs* from a bounded authorized per-user registry summary
  2. ask Node to resolve and authorize versions before content enters the prompt
  3. merge auto with manual selections under 5 total, avoid duplicates and disclose why a Skill was suggested
  4. never invent IDs or read other users' GCS records
  5. continue without automatic selection when disabled.
- **Specific tests, negative cases and acceptance evidence:**
  1. T11/T12 and no-owned-skill/malicious registry examples
  2. all selected IDs independently authorized, no extra low-value repeated LLM calls, measured latency.
- **Deliverable and cross-team handoff:** Publish a minor-versioned cross-team fixture and enable behind independent feature flag; do not block manual skills release.
- **PR and stop conditions:** Keep the scope to **PY-SKILL-AUTO**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### NJS-10 — Expand Create Image integration to reference images, selected Skills and model controls
- **Owner:** Node + Frontend. **Depends on:** FE-SMOKE-01, NJS-06, NJS-08, FE-02.
- **Implementation:** Expand personalization path to GCS input refs, manually selected Skills and capability-aware model settings while retaining the same Create Image UX and explicit legacy choice. Brand selection/application is a separate follow-on path through NJS-09B/FE-BRAND-01 and Python Brand context validation; it must not block the image+Skill implementation.
- **Acceptance:** Flag OFF old behavior identical; ON no silent model/settings drop; 1–10 outputs and partial success rendered; auth errors preserve re-sign-in.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — NJS-10 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** frontend Create Image node and canvas.api.ts currently support legacy generation and model settings, not all personalized context.
- **Read, modify or add these files:** EDIT imageKind.tsx, frontend/src/api/canvas.api.ts and new Node payload assembler; add Playwright tests. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Integrate authorized input asset IDs, node references, selected Skill IDs and model settings with new Python async path; accept optional Brand only after its resolver/selection and Python validation are implemented through separate Brand work
  2. enforce five-ref/5-Skill constraints
  3. handle pending/running/completed/partial_success/failed/needs_clarification and failed-slot retry when available
  4. preview via authenticated proxy
  5. show explicit unsupported selection instead of silent route fallback
  6. keep old flag-off Create Image behavior unchanged.
- **Specific tests, negative cases and acceptance evidence:**
  1. T01/T03/T04/T07/T08/T11/T22/T23/T25/T26 (Brand T27 is gated on NJS-09B + FE-BRAND-01)
  2. 1/3/10 outputs, all six statuses and keyboard/zoom
  3. model controls not silently ignored.
- **Deliverable and cross-team handoff:** Provide browser network payload traces and side-by-side legacy/new screenshots; do not alter video/text nodes.
- **PR and stop conditions:** Keep the scope to **NJS-10**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

**v2.8 mandatory Claude implementation addendum — NJS-10**

- **Combined selection E2E:** When personalization ON, the same Create Image prompt may contain `@skill` mentions and picker selections. Confirm that NJS-08 resolves the union within five unique IDs and doesn't send raw mention Markdown to Python. When OFF, the legacy 20-Skill/400-KB path remains unchanged. Ensure new GCS `assetId` drag-out and old-path data URL compatibility work; do not silently route references to a different model. Add end-to-end tests for both modes, including reload of an asset-backed node.


### P5 — Durable asynchronous jobs, security and handoff

#### ASYNC-01 — Create durable job reservations and Cloud Tasks dispatch
- **Owner:** Node. **Depends on:** GCS-02B, NJS-04
- **Implementation:** **Reuse GCS-02A** for durable output reservations and the complete seven-day duplicate-request check, and **reuse GCS-02B** for async job indexes, admission and crash recovery. This issue **only adds deployed Cloud Tasks producer/dispatch**, deterministically named tasks with opaque IDs and its enqueue/retry/reconciliation adapter. Cloud Tasks producer can be implemented and tested with a fake worker/approved task fixture before LOCAL-ASYNC-01 exists; it does not own a status GET route. **Deployed E2E release requires** LOCAL-ASYNC-01, ASYNC-02 and the existing status GET, but those are not producer-code merge prerequisites. Do not implement a second idempotency service, status endpoint or internal worker callback routes.
- **Acceptance:** Fake Cloud Tasks client tests the enqueue adapter without a running local dispatcher. Two same-key submissions create one job/task; Cloud Tasks error does not create unrecoverable phantom job; status survives restart; seven-day window tested.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — ASYNC-01 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** GCS-02A already owns reservations/idempotency and GCS-02B already owns state/indexes/private routes; current app has no Cloud Tasks producer or transactional job queue.
- **Read, modify or add these files:** ADD backend/src/services/cloudTasksDispatcher.ts and deployment queue config/docs; EDIT personalization submission to enqueue after durable admission. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. **Consume** the already-implemented GCS-02A reservation/idempotency service and GCS-02B job-admission/index helper (do not create a second request/job/slot/index implementation); after authoritative admission, enqueue a deterministically named Cloud Task containing only `job_id`/`schema_version` with OIDC. Recovery or an existing same-key replay must not create duplicate job/task records.
  2. return 202 within 15s when admitted/dispatchable
  3. record enqueue error as dispatch_pending and reconcile index marker
  4. **call the existing GCS-02A replay/conflict service** and honor its seven-day/tombstone policy; never implement the key algorithm again
  5. never include raw prompt/images/Skills in task body
  6. child failed-slot retries call the same admission helper.
- **Specific tests, negative cases and acceptance evidence:**
  1. T13/T14/T16/T19/T28/**T37**
  2. concurrent duplicate click, Cloud Tasks network error after task created, missing task, orphan index, stale pending marker, retry child creates both indexes, no double job/task dispatch.
- **Deliverable and cross-team handoff:** Provide real queue config, IAM verification and redacted task payload fixture; one authoritative GCS state writer remains Node.
- **PR and stop conditions:** Keep the scope to **ASYNC-01**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### ASYNC-02 — Implement Cloud Tasks Python worker, CAS leases and callbacks
- **Owner:** Python + Node. **Depends on:** LOCAL-ASYNC-01, PY-13
- **Implementation:** Extend the Python worker built in LOCAL-ASYNC-01 for authenticated deployed Cloud Tasks OIDC; develop and test against the canonical opaque-job task fixture and a fake Cloud Tasks producer. **ASYNC-01 is required at deployed E2E validation, not to merge this worker-side adapter**; reuse the GCS-02B-owned Node payload/claim/events routes, GCS CAS lease, bounded two-call concurrency, 25-min deadline and at-least-once reconciliation. Do not duplicate Node handlers.
- **Review correction:** Emit fixtures for `attempt_started`, `slot_failed`, `clarification_required` and lease failure; test 60s lease, 20s renew, 30s expiry grace, fencing rejection and uncertain invocation reconciliation.
- **Acceptance:** Double-delivered task does not duplicate paid call; callback event dedupe; uncertain timeout reconciled before retry; 1,3,10 outputs supported.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — ASYNC-02 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** LOCAL-ASYNC-01 has already introduced the Python worker endpoint and local dispatcher; this issue hardens the same Python worker for Cloud Tasks/IAM/OIDC. GCS-02B already owns Node private `/payload`, `/claim`, `/events` routes.
- **Read, modify or add these files:** EDIT existing planned Python `app/api/routes/generation_worker.py` from LOCAL-ASYNC-01 for deployed Cloud Tasks OIDC handling and add Python worker integration tests. **Do not add or recreate Node private callback endpoints:** GCS-02B already implements Node `/payload`, `/claim`, `/events`; adjust only verified authentication wiring and relevant tests as needed. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Verify OIDC task identity, load job solely by opaque job_id from authenticated Node payload endpoint, acquire 60s lease/renew at 20s with 30s grace and fencing count
  2. honor max two simultaneous model calls per job, write reserved images, report immutable events and final status, retry/ack task only after Node durable finalization
  3. reject local-token auth in deployed environment and never write Node state bucket directly.
- **Specific tests, negative cases and acceptance evidence:**
  1. T16/T17/T18/T24/T28/T32/T33/**T37**
  2. at-least-once duplicate delivery, stale worker callback 409, renewal failure, uncertain model timeout no blind replay, callback outage and recovery, 1/3/10 results.
- **Deliverable and cross-team handoff:** Publish worker route, required IAM audience and failure/ack semantics shared with Node/cloud.
- **PR and stop conditions:** Keep the scope to **ASYNC-02**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### NJS-11 — Record requests, model attempts and verified outputs accurately
- **Owner:** Node. **Depends on:** GCS-02B
- **Implementation:** Implement and test accounting from the existing GCS-02B immutable event fixture ledger before deployed Cloud Tasks exists; deployment-side ASYNC-01/ASYNC-02 and Python PY-12 must pass the joint accounting acceptance gate later. Build audited request/attempt/output accounting and retry lineage from **existing** GCS-02A idempotency/requests and GCS-02B immutable event ledger. Count actual Python model calls separately from output images. **Do not** create another seven-day dedupe mechanism, worker callback endpoint or job-status API.
- **Acceptance:** GCS-02A already passes duplicate-submit 202/200 and 409 contract tests before this issue. Here, request/attempt/output counts and retry provenance are correct, reconcilable and unaffected by event replay or multi-output model calls.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — NJS-11 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Current backend/src/lib/jobStore.ts serves video jobs only, with TTL; there is no durable requests/attempts/outcomes accounting.
- **Read, modify or add these files:** ADD backend/src/services/generationAccounting.ts and GCS event projector/tests. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Read existing GCS-02A request and idempotency reservations; do not write a second request for a replayed client action.
  2. Count actual Python-reported model invocation attempts and verified output assets independently.
  3. Project actual attempt IDs, retry lineage and token/cost metadata from GCS-02B's already-deduplicated callback event ledger into queryable GCS accounting manifests without reimplementing its event-dedupe/CAS logic.
  4. Validate that GCS-02A already enforces seven-day replay (same payload 202/200, changed payload 409); only use those records to avoid double counting. Do not implement or change key expiry here.
  5. Do not assume count=N implies N API attempts; provide count/provenance reconciliation tools.
- **Specific tests, negative cases and acceptance evidence:**
  1. T03/T04/T13/T14/T15/T16/T34
  2. two outputs from one attempt counted correctly
  3. retry creates new child request with linked lineage
  4. event callback redelivery does not double charge/count.
- **Deliverable and cross-team handoff:** Provide GCS request/attempt/output JSON examples and query-free stats, no BigQuery and no separate state database.
- **PR and stop conditions:** Keep the scope to **NJS-11**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### PY-12 — Emit real model attempts, outcomes and per-slot retry provenance
- **Owner:** Python. **Depends on:** PY-10
- **Implementation:** Emit actual per-invocation attempt ID, retry_of_attempt_id, provider response, optional token usage, timings and outcome via Node callback.
- **Review correction:** Ensure per-slot failure and retry-lineage event fixtures; never reissue uncertain provider calls solely because a 60s lease elapsed.
- **Acceptance:** 1 request with N outputs never guesses N attempts; failure and retry metadata reflect real calls; no direct authoritative state writes.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — PY-12 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Existing Python observability/operations.py, run_trace.py, image_model_client.py can be reused for actual provider event reporting.
- **Read, modify or add these files:** ADD app/services/execution_events.py and tests; adapt new worker to emit event types under §5.5B/E. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Record each actual Gemini invocation with distinct attempt_id, timing, provider outcome, returned image count, slot association, retry_of_attempt_id when known and optional usage
  2. emit attempt_started/attempt_finished/slot_failed/output_saved/job_finalized in deterministic sequence with unique event IDs
  3. ensure callback dedupe and no direct Node authoritative state write
  4. avoid leaking private raw prompts/secrets in telemetry.
- **Specific tests, negative cases and acceptance evidence:**
  1. T03/T04/T17/T18/T32/T33/T34
  2. multi-image single invocation, provider refusal, partial result, callback retry and uncertain model timeout
  3. event counts reflect reality.
- **Deliverable and cross-team handoff:** Publish verified event fixtures and mapping of provider errors to shared codes for Node accounting.
- **PR and stop conditions:** Keep the scope to **PY-12**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### NJS-12 — Implement job statuses, error mapping and explicit failed-slot retry
- **Owner:** Node. **Depends on:** LOCAL-ASYNC-01
- **Implementation:** The LOCAL-ASYNC-01 endpoint and GCS-02B event ledger are sufficient prerequisites; NJS-11 detailed reporting can be developed in parallel. **Extend the existing authenticated GET `/api/personalization/jobs/:jobId` route created in LOCAL-ASYNC-01** with complete terminal/error semantics, retry availability, and safe reconciliation. Reuse six public statuses and the GCS-02B event -> CAS projection; do not register a duplicate status route. This issue additionally implements the explicit single-failed-slot retry endpoint and full error mapping.
- **Review correction:** Add canonical `POST /api/personalization/jobs/:jobId/slots/:slot/retry` guarded by original job owner, terminal failed slot, retryable/confirmed state, active retry CAS, new idempotency key and linked child request/job; **create both global child indexes following §4.1A and delete the child pending marker only after terminal CAS**; no retry of successful slots.
- **Acceptance:** Zero outputs never completed; partial final only after missing slots terminal; closed session code, clarification status, 413 and all listed codes verified.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — NJS-12 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Node canonical job status is a GCS CAS snapshot; existing video job statuses are different and must remain untouched.
- **Read, modify or add these files:** EDIT the existing `backend/src/routes/personalizationJobs.ts` introduced by LOCAL-ASYNC-01 (or its confirmed actual checkout path); ADD `backend/src/services/slotRetryService.ts` (proposed) plus full error-mapping and retry tests. Never recreate/register a second job GET route. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. **Extend, do not recreate**, LOCAL-ASYNC-01's existing GET `/api/personalization/jobs/:jobId`: retain owner/index checks and add complete code-to-HTTP/UI mappings, finalized failed slots, clarification and retry links.
  2. Add retry endpoint for one terminal failed retryable slot after reconciliation; accept a new frontend idempotency key and call GCS-02A's existing atomic replay/conflict service before GCS-02B child job admission.
  3. create a **new child** request/job/output reservation and new idempotency key, **write both global child indexes through §4.1A**, then dispatch using the already-configured local dispatcher or deployed Cloud Tasks adapter, without implementing either dispatcher here
  4. Reuse GCS-02A to return the original child job on exact key replay, and return 409 retry_reconciliation_required or retry_already_running for unsafe/conflicting cases
  5. never mutate original terminal job or regenerate successful slots.
- **Specific tests, negative cases and acceptance evidence:**
  1. T04/T05/T07/T17/T20/T31/T34/**T37**
  2. exact error code/HTTP mapping, new child indices present and pending marker removed when terminal, foreign job 404, state snapshots survive restart.
- **Deliverable and cross-team handoff:** Provide public job-status and slot-retry fixture library for frontend, with retry button disabled until this issue actually works.
- **PR and stop conditions:** Keep the scope to **NJS-12**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

**v2.8 mandatory Claude implementation addendum — NJS-12**

- **Canonical paths:** This issue **extends** the status handler created by LOCAL-ASYNC-01. It must not implement/rename legacy `GET /api/generate/job/:jobId` or change its `pending/done/failed` enum. Use the *full* explicit retry route: `POST /api/personalization/jobs/:jobId/slots/:slot/retry`. Update all examples and tests to eliminate shorthand `POST /jobs/:id/slots/:slot/retry`.
- **Frontend client contract:** `getPersonalizationJob(jobId)` returns the new six-state job response; existing `getJob()` continues to call the legacy video endpoint. Retry is owner-checked, creates a new child job/indexes and does not overwrite the parent or regenerate successful slots. Do not mark the user-facing retry action working until NJS-12 + Python retry provenance integration passes.


#### PY-13 — Deploy private authenticated Python Cloud Run worker
- **Owner:** Python + Cloud admin. **Depends on:** GCS-01, NEW-04.
- **Implementation:** Deploy authenticated private FastAPI Cloud Run worker with Python service identity, IAM Run Invoker/Task OIDC, protected Node callbacks and actual model/GCS rights. Local real smoke does not depend on this issue.
- **Acceptance:** Unknown service principal rejected; authorized task works; no browser cookies sent; real worker meets measured deadline.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — PY-13 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Standalone Python FastAPI route exists only after PY-03/PY-LIVE; Cloud Run service and IAM configuration must be provisioned.
- **Read, modify or add these files:** ADD Dockerfile/deploy scripts or EDIT existing Python Dockerfile and docs for distinct private worker settings. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Deploy service requiring authentication
  2. grant Cloud Tasks service account run.invoker and Python worker least-privilege GCS output create/approved input read plus Vertex AI
  3. verify service audience/ingress, task dispatch deadline 29m and Python worker 30m
  4. block PYTHON_GENERATION_BACKEND=mock and local header tokens in deployed runtime
  5. confirm Python uses stable model ID/region and does not accept browser cookies.
- **Specific tests, negative cases and acceptance evidence:**
  1. T24/T28/T33
  2. authorized task completes, unauthorized principal rejected, worker timeout/restart behavior reconciled, production environment rejects local secrets, no public bucket or endpoint bypass.
- **Deliverable and cross-team handoff:** Provide redacted gcloud configuration, service URL, project/region and IAM proof for NJS-15.
- **PR and stop conditions:** Keep the scope to **PY-13**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### NEW-03 — Harden deployed proxy identity and infrastructure OIDC (release security gate)
- **Owner:** Frontend/Node + Security. **Depends on:** NEW-03-TRANSPORT
- **Implementation:** Review trusted frontend-to-Express identity and `docs/specs/001-auth-design.md`, fail closed if mandatory Cloud Run OIDC token minting fails, and stop treating a raw cookie string as verified identity. **Do not reimplement binary proxy forwarding**; NEW-03-TRANSPORT supplies it and may merge before security approval.
- **Acceptance:** Required infra token minting failure produces safe 503 with **zero backend calls**; raw cookie cannot impersonate user; legacy `token_expired` continues to reauthenticate; Cloud Run IAM/IAP and trusted identity tests documented; cloud/security approval recorded **before deployed personalization release**, not before local binary proxy merge. T40/T47 and security cases pass.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — NEW-03 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** frontend/src/app/api/proxy/[...path]/route.ts is reported to continue when infrastructure token minting fails and may forward unverified cookie as identity.
- **Read, modify or add these files:** EDIT that proxy only after reading docs/specs/001-auth-design.md and existing token/session rules; ADD route auth failure tests. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Audit actual frontend → Express OIDC and user-identity headers, cookie handling and auth expirations
  2. fail closed if a required infrastructure token is absent
  3. stop treating arbitrary forwarded cookie text as a verified bearer identity
  4. preserve existing re-sign-in behavior and local auth modes, coordinate IAM changes with security.
- **Specific tests, negative cases and acceptance evidence:**
  1. T02/T23/T24
  2. token mint failure blocks request, valid user session still works, token_expired triggers sign-in, cookies/secrets not accidentally logged or proxied to Python.
- **Deliverable and cross-team handoff:** Security sign-off with before/after threat model and rollback; do not silently refactor unrelated proxy behavior.
- **PR and stop conditions:** Keep the scope to **NEW-03**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

**v2.8 historical Claude addendum — NEW-03 (transport ownership superseded by v2.9 NEW-03-TRANSPORT; authentication requirements remain binding)**

- **Security owner, not binary transport owner:** NEW-03-TRANSPORT alone implements the byte-safe proxy, content header allowlist and T39 binary tests. This issue verifies that its transport fix does not weaken identity and implements fail-closed OIDC/verified user propagation without reimplementing it.
- **Sign-in handling:** Use verified frontend bearer credentials as `X-User-Identity` only under the existing trusted frontend-to-Express service boundary; keep the backend's legacy token-expiry shape. Never put a raw `Cookie` header string in an `Authorization`/identity field. The frontend may forward the original cookie as a cookie for existing session behavior but it is not proof of user identity. Missing required Cloud Run OIDC is **fail closed** with a safe 503, not a backend call without infrastructure auth. Do not forward any user cookies/credentials to Python. Check `docs/specs/001-auth-design.md` before changing current user-login behavior.
- **Security tests:** Confirm NEW-03-TRANSPORT tests remain green; separately test required OIDC mint failure -> 503 with zero backend requests, invalid/forged cookie/header denied, valid verified-user forwarding, legacy 401 `token_expired`, and no leaked Python/GCS credentials. Security approves deployed rollout only after these pass. Do not implement upload catalog, image bytes or asset authorization here.


#### NJS-13 — Expand authorized asset catalog, previews, expiry and deletion
- **Owner:** Node. **Depends on:** NJS-13-LITE, GCS-02A.
- **Implementation:** Expand authorized input/output catalog and implement **throttled `last_used_at` touch-on-authorized-read**: `GET /api/assets/:assetId/content` updates the GCS manifest with CAS at most once per asset per 24h, before streaming when touch is due; unauthorized/404 reads never update. Preserve soft delete/undo, safe headers, and no signed URL/public ACL.
- **Review correction:** `last_used_at` is refreshed by a real authorized content fetch (throttled to 24h) and by verified successful generation output creation; cleanup honors the latest timestamp, active jobs and explicit server-managed holds using CAS/tombstones. A browser-only board is NOT a server-known pin: offline boards beyond the proposed 30-day inactivity period may have expired assets. Never claim indefinitely protected images for browser-only boards.
- **Acceptance:** Authorized content reads refresh `last_used_at` no more than once/24h with CAS; cross-user/missing reads never touch; cleanup-vs-fetch races preserve consistent tombstones; browser-only offline board semantics and 410 are documented and tested; asset owner isolation and checksum/generation verification remain intact. No deletion enabled before retention/security approval.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — NJS-13 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Minimal verified binary proxy lands in NJS-13-LITE; input asset manifests arrive in NEW-01.
- **Read, modify or add these files:** EDIT backend asset routes/services and frontend AssetsPanel as needed; ADD retention/cleanup job and tests. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Expand asset catalog for inputs and all generated outputs
  2. track immutable GCS generation/hash/size, last_used_at, reference counts or safe reference rules, deleted/expired visibility, preview caching/headers and soft-delete/undo
  3. implement `touchLastUsedAt(assetId, ownerKey, now)` on **successful authorized content fetch**, compare GCS generation and write only if prior touch is older than 24 hours; on CAS conflict reread and reconcile. Never touch unauthorized reads, and never serve a CAS-tombstoned object. Test read-vs-cleanup races.
  4. protect active jobs/retries and explicit server-side holds, but **do not infer active board references from localStorage**. Implement 30d inactivity cleanup only after retention approval; no creation-age lifecycle rule for last-use policy. A board reopened after expiry displays `410 asset_expired` instead of a false promise that board membership prevented deletion.
  5. enforce 410/404 privacy semantics and authenticated streaming.
- **Specific tests, negative cases and acceptance evidence:**
  1. T09/T18/T20/T26/T36
  2. expired manifest, restore after undo, active job object not deleted, cross-user content denial and invalid GCS metadata
  3. security-approved retention required before cleanup enabled.
  4. T46: authorized-read touch once/24h, unauthorized no-touch, concurrent CAS and cleanup, offline board expiry behavior.

- **Deliverable and cross-team handoff:** Document lifecycle operational runbook and exact GCS ownership boundary, no public signed previews.
- **PR and stop conditions:** Keep the scope to **NJS-13**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### NJS-14 — Remove unused Node Firestore runtime paths safely
- **Owner:** Node. **Depends on:** NJS-01.
- **Implementation:** Remove unused Firestore health probe/SDK/doc references after verifying there are no live backend consumers; do not replace with BigQuery.
- **Acceptance:** Health probes actual configured dependencies; no Firestore runtime import; old generation tests still pass.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — NJS-14 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** backend/src/lib/firestore.ts is small; current backend/src/server.ts health probe references Firestore while boards remain in memory.
- **Read, modify or add these files:** EDIT backend/src/server.ts, remove backend/src/lib/firestore.ts and Firestore dependency/config/deploy docs only after inventory. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Search all source imports and dependency manifests, remove actual unused Firestore probe/SDK, replace health semantics with real configured storage checks without making optional dev GCS fatal at startup
  2. keep current board/generate endpoints intact
  3. do not introduce BigQuery/Cloud SQL or pretend in-memory boards are persistent.
- **Specific tests, negative cases and acceptance evidence:**
  1. Existing backend tests/typecheck pass
  2. grep no runtime Firestore import
  3. /api/health local/prod produces correct dependency status
  4. old image generation unchanged.
- **Deliverable and cross-team handoff:** Provide diff and dependency audit; coordinate Python removal separately via PY-14.
- **PR and stop conditions:** Keep the scope to **NJS-14**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### PY-14 — Isolate legacy Python Campaign/Firestore paths from new execution
- **Owner:** Python. **Depends on:** PY-01, PY-LIVE-01.
- **Implementation:** Isolate and retire Campaign/Firestore paths from new generation code without breaking unrelated legacy Python routes still referenced.
- **Acceptance:** Standalone image path has no Campaign/Firestore dependency; import/runtime smoke passes; migration notes recorded.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — PY-14 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Current Python app/orchestrator/campaign_pipeline.py and app/services/firestore_client.py are legacy modules, not required on new standalone route.
- **Read, modify or add these files:** EDIT only new generation routing/dependency imports and isolated legacy compatibility modules; avoid broad deletion without caller inventory. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Ensure app/main.py can start new standalone router without importing Campaign/Firestore dependencies through generation path
  2. mark legacy routes as gated/retained or retire only when confirmed unused
  3. remove unused Python Firestore config only after PY-01 inventory and PY-LIVE tests
  4. keep authorized state writes in Node/GCS.
- **Specific tests, negative cases and acceptance evidence:**
  1. Python startup succeeds without Firestore credentials for new route, direct image smoke unaffected, legacy route behavior either explicitly gated or regression tested, no hidden Campaign requirement in PY-09.
- **Deliverable and cross-team handoff:** Hand documented migration/retirement list to cross-team owners, with no accidental deletion of used project APIs.
- **PR and stop conditions:** Keep the scope to **PY-14**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### NJS-15 — Run full staging end-to-end acceptance and rollback
- **Owner:** Node + Frontend QA. **Depends on:** NJS-10, NJS-12, NJS-13, PY-15, NEW-03, ASYNC-01, ASYNC-02, NJS-09B, FE-BRAND-01, PY-09, NJS-11, PY-12.
- **Implementation:** Full staging E2E, original Create Image rollback OFF, input+Skills+Brand cases, 1/3/10 images, timeouts, duplicate tasks, cross-user denial, Playwright.
- **Acceptance:** Gates G1–G6 signed, failing steps documented, 50/100/150% zoom evidence and exact contract version published. Explicit release gates include deployed Cloud Tasks enqueue and Python worker, owner-authorized Brand selection and Python application, Node request/attempt accounting matched to Python events, and NEW-03 reviewed IAM/auth. NEW-03-TRANSPORT is transitively merged for bytes. All T01–T49 apply; no release sign-off is permitted without recorded evidence for the entire matrix.

- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — NJS-15 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** New canvas API, GCS state/indexes, Python worker and Cloud Run authorization must all exist; initial CI may be disabled.
- **Read, modify or add these files:** ADD frontend/e2e/gcos-personalization.spec.ts and docs/integration/e2e-evidence.md (proposed), plus repeatable staging test commands. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Run contract fixture suites with pinned checksum in both repos
  2. deploy behind flag and smoke one prompt, 1/3/10 outputs, 5 image refs, 5 Skills, Brand, guardrails, clarification, partial results and failed-slot retry
  3. verify GCS output and owner indexes, duplicate task claims, T37 crash paths, async 202/polling, secured preview, token expiry, rollback flag OFF and old Create Image
  4. record model/region/IAM configuration and UI at 50/100/150% zoom.
- **Specific tests, negative cases and acceptance evidence:**
  1. All T01–T49 have results with links/commands, including security, binary transport, identity, asset retention and unsaved-Skill tests
  2. no bypasses on cross-user or service auth, retention sign-off recorded, real image generated, output checked and previewed
  3. remaining failures block release.
- **Deliverable and cross-team handoff:** Provide signed release gate document by Node DRI, Python lead, FE QA and cloud/security, with rollback command and evidence pointers.
- **PR and stop conditions:** Keep the scope to **NJS-15**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

**v2.8 mandatory Claude implementation addendum — NJS-15**

- **v2.8 release gate:** Block sign-off until NEW-03 binary-safe proxy/auth, NJS-13-LITE authenticated streaming, NEW-01 raw upload, NJS-04A deployed IAP-anonymous refusal, FE-SMOKE-01 durable asset references/reload/undo/drag/download, FE-02 + NJS-08 combined Skill mentions, and NJS-12 exact retry route all pass shared T38–T45. Verify `GCS_BUCKET_NAME` single-dev bucket and optional production bucket settings against actual deployment. Record legacy Create Image, legacy `getJob()` and placeholder behavior as regressions, not silent migrations. Report the current commit used for testing and differences from the earlier snapshot.


#### PY-15 — Publish Python integration runbook and smoke-test evidence
- **Owner:** Python + QA. **Depends on:** PY-13, PY-12, PY-07.
- **Implementation:** Deliver Python runbook, model registry, API/fixtures, IAM permissions, attempt GCS verification, negative test artifacts and callbacks.
- **Acceptance:** Matching contract suite green; request IDs traceable across two services; production model/region verified.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — PY-15 (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Python PY-13 worker/Vertex/PY-12 event code must exist; shared contract maintained by SH-01.
- **Read, modify or add these files:** ADD docs/integration/python-handoff.md and smoke script/tests referencing pinned contract fixtures. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Document interpreter/env/ADC, model region, permissions, direct count=1 and local async 1/3/10 commands, Cloud Tasks OIDC/invocation path, callback auth/leases, output checksums and retries, known provider limits and safe reconciliation
  2. include safe redacted request/response/event examples and exact application logs correlation.
- **Specific tests, negative cases and acceptance evidence:**
  1. Run exact Python Pydantic suite, mocked provider and live smoke when authorized, callback stale-fence/timeout negative cases, compare contract hash with Node
  2. no secrets in runbook.
- **Deliverable and cross-team handoff:** Provide reproduction steps and pass/fail evidence for NJS-15 rather than assertions of unexecuted live tests.
- **PR and stop conditions:** Keep the scope to **PY-15**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

#### NJS-LEGACY-GCS — Defer optional legacy Create Image output migration to GCS
- **Owner:** Node + Frontend. **Depends on:** NJS-13
- **Scheduling:** Explicitly deferred until after initial release; this schedule is not a code-level dependency on NJS-15.
- **Implementation:** Explicit later migration of legacy Create Image data URLs into GCS; user/owner consent and backward-compatible board migration, not part of first personalization.
- **Acceptance:** Old output history preserved, rollback possible, no regression; do not implement in first integration chain.
- **PR evidence:** exact changed files, approved schema hash if applicable, commands + results, negative/security cases, no unrelated behavior changes.


**Claude-ready implementation handoff — NJS-LEGACY-GCS (mandatory issue body extension)**

- **Why this issue exists / checked baseline:** Current legacy frontend image generation uses data URLs and IndexedDB; new Python GCS path is separate and the legacy flow is rollback.
- **Read, modify or add these files:** OPTIONAL post-release change to frontend canvas persistence/upload helper and backend asset APIs, after approved migration design. New filenames are **proposed** until verified in the target checkout.
- **Step-by-step implementation:**
  1. Inventory browser-stored legacy images and record compatibility and user consent
  2. upload old outputs to owner-scoped GCS with hash and asset IDs
  3. preserve board references/undo and no accidental deletion
  4. provide migration retry/report and reverse compatibility while feature flag OFF
  5. do not change existing Create Image while first Python integration is being delivered.
- **Specific tests, negative cases and acceptance evidence:**
  1. T20/T25/T26/T36
  2. old canvases open, migrated images preview, failed migration recoverable, no duplicate objects for same asset, rollback tested.
- **Deliverable and cross-team handoff:** Keep this issue explicitly deferred; no dependency from first live milestone and no surprise work inside NJS-04/FE-SMOKE.
- **PR and stop conditions:** Keep the scope to **NJS-LEGACY-GCS**, do not merge if prerequisite contract/schema revisions remain unapproved, do not claim a cloud run occurred without evidence, provide `git diff --name-only`, commands and actual results, and document rollback. Preserve existing feature-flag-OFF behavior.

## 10. Windows/GCP runbook, shared environment handoff and test matrix

### 10.1 First things the cloud administrator/product requester must provide

Do **not** put project secrets, tokens, service-account JSON keys or full user data in the issue comments.

| Item | Required information |
|---|---|
| GCP project | verified project ID, project number, billing/API access, approved organization permissions |
| Model | one **actually available** Vertex image model ID/alias and region, quota and cost limit |
| Storage | existing private development GCS bucket named by `GCS_BUCKET_NAME`; optional separate state/asset buckets only after GCS-01 config/IAM work; actual name(s), region and permissions |
| Credentials | ADC approach for local dev, Node/Python/Tasks service account emails and IAM sign-off |
| Service URLs | Python and Node Cloud Run URLs, audience for OIDC; localhost ports 8000/4000 for local mode |
| Execution | Cloud Tasks queue name/region, configured dispatch deadline, rate/retry settings |
| Ownership | named Node DRI, Python lead, frontend/QA contact, cloud/security approver |
| Contract | approved fixtures commit and SHA-256 manifest; target deploy revision/feature flag |

**GCS-only means no BigQuery tables are required for this phase.** Earlier `GCOS_BigQuery_Create_Tables.sql` and the mismatched table names (`sessions` vs `generation_sessions`, `assets` vs `asset_catalog`) are intentionally **not part of this implementation**. Do not create them accidentally while completing a GCS issue.

### 10.2 Verify Python version and install (Windows PowerShell)

The supplied Python `pyproject.toml` explicitly requires **`>=3.13,<3.15`**. Python 3.14 falls within the declared range; always verify dependencies in the target environment and do not instruct this codebase to use Python 3.11. The `py` Windows launcher may not be installed; use `python` once the correct interpreter is selected.

```powershell
python --version
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
# If supported by this repository and tests are needed:
python -m pip install -e '.[test]'
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In another shell:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/healthz
```

The existing `/healthz` response is the verified readiness target; the generation route **must first be implemented**. The `-e '.[test]'` step depends on installer/project compatibility; use `python -m pytest` after dependencies are present. Project-specific Vertex settings are read from Python's existing configuration: verify current `BPS_` prefixed settings and do **not** copy hypothetical names into production blindly.

### 10.3 Local Google credentials and buckets

```powershell
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud auth application-default login
gcloud storage buckets list --project=YOUR_PROJECT_ID
```

If a bucket genuinely needs creation and your identity has permissions:

```powershell
gcloud storage buckets create gs://YOUR_PRIVATE_DEV_BUCKET --location=YOUR_APPROVED_REGION --uniform-bucket-level-access
```

For the first working demo set `GCS_BUCKET_NAME=YOUR_PRIVATE_DEV_BUCKET` in Node and align the Python writer to the same approved bucket. Create a second state bucket only after the optional GCS-01 two-bucket configuration and IAM tests are implemented. Confirm public access prevention and IAM separately using your organization's approved cloud setup; **creating a bucket alone does not grant the correct service account permissions**. Test GCS write/read using ADC before trying the model. Avoid long-lived downloaded service-account keys.

### 10.4 Start backend and frontend independently

```powershell
# In GCOS-personalization/backend
npm install
npm run dev
# expected default from repo docs: http://127.0.0.1:4000
```

Example **backend** `.env` values for local *direct smoke* integration after features exist (CLI/supertest only, count=1):

```dotenv
PERSONALIZATION_PYTHON_ENABLED=true
PYTHON_SERVICE_URL=http://127.0.0.1:8000
PERSONALIZATION_EXECUTION_MODE=local_direct_smoke
# For no-Python contract tests ONLY: change to mock (local/test only).
# For browser 1..10 real images: change to local_async and start the dispatcher.
PYTHON_DIRECT_TIMEOUT_MS=270000
PYTHON_ACCEPT_TIMEOUT_MS=15000
GCS_BUCKET_NAME=YOUR_PRIVATE_DEV_BUCKET
# Optional AFTER GCS-01 adds and tests explicit two-bucket config:
# GCS_STATE_BUCKET_NAME=YOUR_PRIVATE_STATE_BUCKET
# GCS_ASSET_BUCKET_NAME=YOUR_PRIVATE_ASSET_BUCKET
# existing verified OAuth/session/Vertex configuration remains required
```

`PERSONALIZATION_EXECUTION_MODE`, `GCS_STATE_BUCKET_NAME`, and `GCS_ASSET_BUCKET_NAME` are **proposed settings to implement**; the **existing** Node integration currently reads `GCS_BUCKET_NAME`. Neither the proposed variables nor the new personalization execution flags are evidence that code already handles them. Do not replace the existing backend's working environment configuration or expose Python URL in frontend variables.

```powershell
# In GCOS-personalization/frontend
npm install
npm run dev
# http://localhost:3000
```

Log in through existing GCOS Google OAuth flow. The frontend proxy continues to authenticate the user. Local `AUTH_MODE=anonymous` may test the mock path only; **it must not issue real Gemini or cross-user GCS jobs**. For programmatic supertest, use the test harness to inject **verified-format credentials** rather than forwarding a random user ID header.


For the **browser's real count=1..10 flow**, switch to `PERSONALIZATION_EXECUTION_MODE=local_async` **after** LOCAL-ASYNC-01 is implemented, start its separate local dispatcher using the documented script in that issue, then use Node 202 + `GET /api/personalization/jobs/:jobId` polling. `local_direct_smoke` is not a production or browser setting. Do not put `PERSONALIZATION_EXECUTION_MODE=local_direct_smoke` into a Cloud Run release.

### 10.4A Local Python direct-token setup (NJS-03/PY-03) and later dispatcher callbacks (LOCAL-ASYNC-01)

Do not invent a static development identity header. The chosen service-to-service scheme is specified in §5.5D. Generate **two different random tokens** in PowerShell from the installed, repository-compatible Python:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(32))"
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Store the **first** value as `LOCAL_NODE_TO_PYTHON_TOKEN` in Node/dispatcher and Python's **untracked** local env configuration. Store the **second** value as `LOCAL_PYTHON_TO_NODE_TOKEN` in Python and Node's untracked local env configuration. Never commit, print into CI logs, forward to the browser, or use either token in Cloud Run. Node and Python compare in constant time; internal endpoints reject absent/wrong tokens with `401 internal_auth_failed`. Bind internal listener/test services to loopback on the local machine. The NJS-03 local direct client first invokes Python `/v1/generation/execute` with the first token; later the local dispatcher invokes Python `/v1/generation/jobs/execute` with that first token; Python calls Node's internal `/payload`, `/claim` and `/events` using the second. The two tokens are **not** user sign-in credentials; real Vertex generation still requires an authenticated user job already authorized by Node.

```env
# illustrative untracked local dev env settings; do NOT commit actual values
LOCAL_NODE_TO_PYTHON_TOKEN=<generated-different-random-value-A>
LOCAL_PYTHON_TO_NODE_TOKEN=<generated-different-random-value-B>
PYTHON_GENERATION_BACKEND=vertex
PERSONALIZATION_EXECUTION_MODE=local_async
```

**Timing:** Create the first Node-to-Python credential and implement its Python validation in NJS-03/PY-03 **before the first PY-LIVE-01/NJS-LIVE-01 real direct call**; test absent/wrong/valid service token. The second Python-to-Node credential is used only after GCS-02B internal routes and LOCAL-ASYNC-01 callbacks exist. Local tokens never replace real GCOS user login.

For **Node-only mock tests** set `PERSONALIZATION_EXECUTION_MODE=mock` (in-process fake, no Python call). For **Python mock endpoint tests** set `PYTHON_GENERATION_BACKEND=mock` and call Python directly, or choose Node `local_direct_smoke` to test the real HTTP Python mock response. For **real local-direct tests** use Python `vertex` and Node `local_direct_smoke`. When deployed, local credential mode and local-direct endpoints must be off, Cloud Run IAM/OIDC is required, and `PYTHON_GENERATION_BACKEND=vertex` is mandatory. Start `npm run personalization:worker:local` **only after** LOCAL-ASYNC-01 implements and documents that script.

### 10.5 Local real HTTP tests

1. **Node contract only**: call new `/api/personalization/execute` via authenticated test client while client is mocked; expect `executionMode=mock`, `status=pending`, zero outputs, strict validation.
2. **Python direct (`count=1`)**: using the shared internal fixture and `X-GCOS-Local-Service-Token` from the untracked `LOCAL_NODE_TO_PYTHON_TOKEN` (verified by PY-03), run one real Vertex image call to the approved model/region; prove bytes exist and upload to authorized GCS slot. Do not claim readiness if Vertex API returns 404/model-not-found.
3. **Real execution in two modes:** configure `PYTHON_SERVICE_URL=http://127.0.0.1:8000`, sign in as a real user. First use `local_direct_smoke` from CLI/supertest with **count=1 only** and a 270s Node client timeout, asserting a terminal direct response. Next start the **separate local async dispatcher/worker** and run **count=1, then 3, then 10** through Node 202/status polling and authenticated Node callbacks. Capture actual invocation events, output checksums and private GCS locations. A browser should use only the async flow.
4. **Preview**: open existing Create Image node with personalization ON, generate, and observe authenticated image proxy. With feature OFF, old behavior must be identical.
5. **Negative tests**: invalid prompt/ratio/count, nonempty unsupported ref stage, wrong Skill hash, private object from another user, failed model, timeout, GCS 403, missing output object.
6. **Later full deployed behavior**: do not claim a direct synchronous local call verifies Cloud Tasks, durable 202/leases or worker redelivery; those are separate G5 tests.

### 10.6 Private Cloud Run integration validation

- Verify deployed `NODE_ENV` / `K_SERVICE`, Node and Python service URLs, configured request timeout and queue dispatch deadline. Python worker and Node internal callback routes require **service identity**; user cookies are not forwarded.
- For Node local → private Python deployed testing, use the approved `gcloud run services proxy` method **only if** the developer has service invocation and network access; use `http://127.0.0.1:8000` as local proxy target. `gcloud run services proxy` is not the same as granting anonymous access.
- Cloud Tasks OIDC task identity must have `roles/run.invoker` on the Python Cloud Run service. The Node enqueuer needs Cloud Tasks enqueue permission and appropriate service-account usage rights; verify tasks service agent configuration as required by the actual project. Python must have approved service identity to call the private Node callback.
- **Proposed deadlines:** Node 15s acceptance, worker 25m execution deadline, Cloud Tasks HTTP target dispatch 29m, Python Cloud Run 30m; provider invocation 240s, Python concurrency 2. Confirm Cloud Run actually uses these values; Cloud Tasks default HTTP target deadline is shorter than 29m.
- Configure Cloud Tasks queue retry/attempt caps so duplicate deliveries are expected and safely reconciled. A task success response means Node accepted final durable events, not merely that Python returned image bytes in RAM.

### 10.7 Minimum test matrix: exact evidence to capture

| Test ID | Scenario | Expected evidence |
|---|---|---|
| T01 | feature flag OFF, signed-out and signed-in | same generic 404, old route unaffected |
| T02 | verified user vs anonymous real | verified accepted; local anonymous mock only, deployed anonymous rejected |
| T03 | `count=1`, `count=3`, `count=10` | exactly N reserved slots; up to N verified images; actual attempt count distinct |
| T04 | N=5 with 3 outputs/2 failed | `partial_success`, three authorized previews, failedSlots two, no invented output |
| T05 | all fail/refusal/no image | `failed`, zero outputs, correct `model_refused`/`no_image_returned` code |
| T06 | vague but viable prompt | enhanced without unnecessary clarification |
| T07 | essential missing product reference | `needs_clarification`, question, zero paid image invocations |
| T08 | 5 valid images + 6th | five accepted by app (if model supports), six rejected 400 |
| T09 | 10MiB + over, 16MP + over, invalid MIME | max boundary accepted, exceeding boundary rejected 413/400/415 |
| T10 | six roles and exclusive main image conflict | valid mapped correctly; duplicate main rejected |
| T11 | 5 Skills / sixth, 100KiB and 300KiB limit, 30k effective | strict validation; no truncation, correct `skill_context_limit_exceeded` |
| T12 | tampered saved Skill bytes | `integrity_error`, no Python model call |
| T13 | same idempotency key same payload while running/final | original 202/200 job; never duplicate paid model work |
| T14 | same key different payload | HTTP 409 `idempotency_key_conflict` |
| T15 | key over 7 days | 409 `idempotency_key_expired`, request intentional new key |
| T16 | concurrent GCS CAS writers, two task deliveries | only one lease holder/slot creator; reconcile after 412 |
| T17 | model timeout with unknown outcome | no blind automatic paid retry; object/event reconciliation |
| T18 | Python saved image but callback failed | durable output reconciled; no duplicate generation on delivery replay |
| T19 | Cloud Tasks enqueue fails after job record | dispatch pending visible/repairable, not abandoned forever |
| T20 | Node preview access owner A vs owner B | A sees image, B receives 404; no public GCS object |
| T21 | invalid client GCS URI/output target | 400, no unauthorized read/write |
| T22 | model picker/quality/thinking/grounding unsupported | explicit error; no silent ignore or model switch |
| T23 | legacy `token_expired` during new route | existing proxy reauthentication path still works |
| T24 | unknown service principal to Python/Node callbacks | rejected, no event writes |
| T25 | existing Create Image flag OFF | same old result/variant behavior, unchanged settings |
| T26 | Playwright canvas at 50/100/150% | image, loading/error/partial/clarification and Skill picker states correct |
| T27 | Brand two profiles, one chosen, old version pin | exact Brand version applied; no Campaign entity |
| T28 | jobs survive Cloud Run restart | GCS state + task re-delivery recovery, terminal state consistent |
| T29 | local direct one-image smoke | 270s separate limit; direct terminal snake_case payload + checksum, not 15s accept; `count>1` explicit mode error |
| T30 | local async 10-image test | Node 202 <=15s, local worker callbacks, real status polling, N verified outputs |
| T31 | mock-only response | HTTP 200 `executionMode:mock`, `pollingAllowed:false`, no statusUrl; frontend stops/no polling |
| T32 | complete typed callback fixtures | `attempt_started`, `slot_failed`, `clarification_required`, `attempt_finished`, `output_saved`, `job_finalized` cross-language validation |
| T33 | lease tests with virtual time | 60s lease, 20s renew, 30s grace, stale fence rejected, uncertain call not regenerated |
| T34 | output slot user retry | new job/idempotency, original terminal state unchanged, active retry conflict, no retry successful slot |
| T35 | owner-key stability | HMAC same issuer/sub stable across sessions, secret v1 version pinned, different issuer or sub yields different key |
| T36 | retention lifecycle | 7-day dedupe, 90-day tombstone, referenced input/output not deleted by cleanup, erasure review |
| T37 | **Global job indexes, direct smoke and retry admission** | Create async job: lookup solely by `job_id` via `v1/index/jobs/` resolves the owner, and `v1/index/pending/` lists the unfinished job; crash at every index/admission step is repaired/alerted without paid execution; terminal and orphaned markers clean up; direct `count=1` smoke creates **neither** global index; a failed-slot retry creates **both** independent child indexes and removes its pending marker on terminal completion; indexed fixtures use `u1_` + exactly 32 lowercase hex characters. |
| T38 | Bearer-only generated image loads through Next.js proxy into Konva | authorized `fetch` returns valid PNG/JPEG/WebP Blob and correct content headers; direct `<img>` without bearer cannot bypass authentication; object URL revoked on teardown; owner B returns 404 |
| T39 | Binary upload/download through proxy (NEW-03-TRANSPORT) | random 10 MiB upload SHA-256 preserved browser→proxy→Node→GCS; 10 MiB+1 denied 413; MIME/signature checked; `Content-Type`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` preserved; OIDC failure is covered separately by T47 |
| T40 | Anonymous deployed IAP security | real personalization, upload and asset read denied for `AUTH_MODE=anonymous` + `IAP_PROTECTED=true`; spoofed IAP identity headers rejected; verified Google session still works; local anonymous mock only |
| T41 | GCS-backed canvas lifecycle | save assetId/jobId; pending reload resumes polling with same idempotency key; success reload previews; undo/delete/drag/download work; no Blob URLs/tokens persisted; expire/missing asset shows correct state; legacy compatibility guarded by request-size limit |
| T42 | Legacy `@skill` and picker coexist | 3 picker + 2 mentions -> 5 unique version-pinned authorized Skills; duplicate counts once; sixth unique rejected; ambiguous or foreign rejected; flag OFF retains legacy 20/400 KB mention behavior as verified on current main |
| T43 | Legacy/new job APIs separated | `getJob()` still calls `/api/generate/job/:jobId` with old statuses; `getPersonalizationJob()` calls `/api/personalization/jobs/:jobId` with six states; retry path is fully namespaced; no duplicate handlers |
| T44 | Bucket env and health compatibility | `GCS_BUCKET_NAME` single-bucket dev works; configured two-bucket opt-in when implemented uses correct permissions and health probes; never accepts public ACL or assumes prefix IAM |
| T45 | Issue-template/CLAUDE/mock compatibility | v2.10 Claude issues fit actual GitHub template with N/A backend UI fields; feature-OFF legacy placeholder behavior unchanged; new mock `executionMode: mock` does not poll or invent images |
| T46 | `last_used_at` and canvas retention semantics | Authorized binary fetch updates manifest via CAS no more than once per 24h; unauthorized fetch does not touch; deletion races resolve safely; active job holds honored; offline browser-only board may expire with 410; no unapproved automatic cleanup. |
| T47 | NEW-03 deployed auth release gate independent of transport | Binary transport PR merges on T39 alone; deployed OIDC mint failure returns 503 with zero backend calls, no cookie-as-identity, verified login and legacy `token_expired` preserved; security approval recorded before deployment. |
| T48 | Local direct Python authentication before async | PY-03 direct route rejects absent/wrong local Node-to-Python token with 401 before model access, accepts valid local CLI/Node calls, uses constant-time compare, refuses local-token auth in Cloud Run; NJS-03 does not leak token. |
| T49 | Unsaved browser-only Skill in picker or `@skill` | New path blocks localStorage-only Skill with "Save this Skill first" and explicit save/import action; no inline Markdown forwarded; after server save same Skill resolves by ID; flag-OFF legacy mention behavior unchanged. |

### 10.8 Required PR comment / Claude handoff template

```markdown
## Issue
ID: <NJS/PY/FE/ASYNC/GCS ID>
Repo and branch: <...>
Contract version + fixture commit SHA: <...>

## Actual codebase findings
Existing relevant files: <exact paths>
New files proposed: <exact paths>
Assumptions verified / gaps found: <...>

## Implementation changes
- ...

## Scope exclusions / legacy behavior preserved
- ...

## Contract and security
- Inputs/outputs/errors/feature flags: ...
- Owner checks and service identities: ...
- Idempotency/lease/CAS behavior: ...

## Verification executed (actual output, not promises)
- Command: ... Result: PASS/FAIL + log link
- Negative tests: ...
- Cross-user/duplicate/recovery tests: ...
- Frontend 50/100/150% when UI changed: ...

## Acceptance criteria
- [ ] ...

## Remaining blockers / integration handoff
- ...

## Rollback
- Personalization flag OFF restores legacy Create Image; verify explicitly.
```

---

## 11. Risks, non-goals, rollout and release criteria

### 11.1 Risk table

| Risk | Impact | Mitigation / explicit gate |
|---|---|---|
| GCS is not transactional relational storage | concurrent updates, listing performance and multi-object failure | CAS per object, immutable events, single Node writer, capped demo concurrency; load test and revisit transactional DB if necessary |
| Cloud Tasks delivers more than once | duplicate Vertex charges or overwritten assets | Node CAS lease, deterministic task/job IDs, output reconciliation, create-only GCS writes; no blind timeout retries |
| 10 images exceed time/cost budget | task timeout and partial cost | Python concurrency=2, 240s per model call, 25m job deadline, quota-aware registry, trace actual attempts; 29m dispatch deadline configured |
| Image model returns variable number of outputs | mismatch count and attempts | Python explicit slots, return actual outcomes, generate controlled missing slots only when safe |
| GCS output object appears without callback | phantom `running` state | event dedupe, Node reconciliation of reserved slots, callback retry, status repair |
| Private GCS prefix treated as authorization boundary | data leak | Node ownership checks, bucket IAM, distinct service accounts, no public GCS URLs |
| Proxy fails open on OIDC | unauthorized requests | NEW-03 security review and tests before deployed rollout |
| Python existing Campaign/Firestore dependencies | request cannot run independently | PY-01 inventory, PY-04 standalone DTO, PY-LIVE-01 direct Vertex adapter; isolate legacy routes |
| Model ID/region inaccessible | 404/permission failure | actual Vertex model smoke per GCP project/region; capability registry, explicit unsupported errors |
| Skill prompt injection or incorrect preservation | brand/policy violation and inconsistent images | untrusted user Skill boundary, Python mandatory guardrails, explicit image QA; prompts alone don't guarantee identity/logo pixels |
| Contract drift | integration 400/422 or silent output errors | one version-pinned fixture suite, Node+Python co-approval, error/status gate |
| Existing canvas/browser files lost | backward compatibility | don't change legacy outputs when flag OFF; upload references on first use; deferred legacy migration |
| Organization requires additional compliance tooling | deployment block | Cloud/security owner obtains project IAM, scanning, egress and data retention approval; do not bypass policies |

### 11.2 Release stages

1. **Development/off:** all existing Create Image users see unchanged legacy route. Mock and standalone service tests run without impacting them.
2. **Early local integration:** real Gemini 1/3/10 through Node/Python with dev GCS and valid user. Canvas preview uses protected Node proxy.
3. **Limited test flag on:** explicit new engine label; users see validation and partial results, no implicit fallback. Skills/Brand available only once versions and design reviewed.
4. **Deployed staging:** Cloud Tasks + worker callbacks + OIDC+IAM, fail-closed proxy, lease and idempotency tested with faults and restarts.
5. **Broader availability:** approve only with named DRI, Python lead, frontend QA and cloud/security sign-off. Rollback switch `PERSONALIZATION_PYTHON_ENABLED=false` returns to old route; do not silently switch failing requests within an ON session.

### 11.3 Final definition of done

- [ ] Shared fixture commit **same hash** in Node and Python; all supported shapes and negative errors tested.
- [ ] Exact integration flow works with **real Vertex AI** in the approved project/region, outputs stored under Node-allocated GCS keys.
- [ ] Actual 1–10 count support; request/attempt/output count distinctions proven; partial/refusal/no-output cases accurate.
- [ ] Seven-day idempotency and duplicate Cloud Task delivery do not create unintended duplicate paid work.
- [ ] GCS-only authoritative state/events have CAS/recovery; no Firestore/BigQuery dependency introduced for new flow.
- [ ] Reference roles/limits, Skill size/hash/rejection limits, trusted guardrails and optional Brand versions enforced.
- [ ] Node proxy only serves owner's image; Python worker private; service OIDC and Cloud Run/IAM verified.
- [ ] Existing Create Image flag OFF regression unchanged; Playwright and zoom tests pass.
- [ ] Runbooks, exact PR test outputs, cost/time budgets, issue mapping and rollback are documented.
- [ ] Named human owner for each D10 role and final sign-offs are recorded (not fabricated in this document).

---

## 12. Source and official platform references

**Repo/source-derived statements:** The original draft `gcos-integration-issues.md` provided current Node/frontend file paths, the NJS/PY/NEW/SH identifiers, gaps X1–X17 and backlog Q1–Q28. The earlier `GCOS_Unified_GCS_Only_Integration_Architecture_and_Issues.md` provided the initial GCS-only strategy and the first attempted issue rewrite. The two supplied repository ZIPs were checked for `backend/package.json`, `frontend/package.json`, Python `pyproject.toml`, and `app/main.py`; **the existing Python project requires Python `>=3.13,<3.15` and currently has `/healthz`**. These are baseline snapshots, not claims about later GitHub revisions. Paths marked as NEW/proposed are not yet verified as code.

**Requester-approved decisions:** Decisions 1 through 9 were selected across the current conversation; their values above are authoritative product requirements for this plan. Decision 10's **role-based governance** is a detailed recommendation awaiting names/acknowledgement, not an asserted approval by individuals.

**External official engineering references (verify deployment configuration in actual project):**
- GCS conditional writes / preconditions: https://cloud.google.com/storage/docs/request-preconditions
- Cloud Tasks authenticated HTTP targets, 30-minute maximum dispatch deadline and OIDC: https://cloud.google.com/tasks/docs/creating-http-target-tasks
- Cloud Tasks → Cloud Run: https://cloud.google.com/run/docs/triggering/using-tasks
- Cloud Run timeout default 300s, configurable up to 3600s: https://cloud.google.com/run/docs/configuring/request-timeout
- Cloud Run request/instance billing modes and work after requests: https://cloud.google.com/run/docs/configuring/billing-settings

**No deployment, Cloud IAM setup, real Vertex generation or Playwright tests were executed as part of authoring this Markdown.** This is an implementable contract and issue backlog, with runnable test instructions and sign-off gates; it does not invent a success result.

---

## 13. Original backlog Q1–Q28 — exhaustive resolution matrix

This matrix is included so reviewers can check **every** question in the original 848-line `gcos-integration-issues.md` rather than searching throughout the architecture. A decision can be resolved conceptually while its implementation/test remains a pending issue.

| Original question | Decision in this plan | Remaining verification / issue |
|---|---|---|
| **Q1** Fake output `[]` vs fake `gs://` | `executionMode:mock`, `status:pending`, `outputs:[]`, **HTTP 200**, **`pollingAllowed:false`**, `statusUrl:null`; terminal **mock exchange only** and no phantom completed asset | NJS-02, PY-03 mock non-polling fixture |
| **Q2** Browser-supplied `request_id` | Ignore and never use browser request ID; Node always generates it; frontend sends separate idempotency key | NJS-02/04 |
| **Q3** Browser `schema_version` | Browser does not send it; Node sets internal `"1"` | NJS-02/PY-02 |
| **Q4** TS schema module | `backend/src/contracts/generationV1.ts` proposed | verify actual import conventions during NJS-02 |
| **Q5** Browser response field naming | camelCase browser/Node; snake_case Node/Python | fixture roundtrip |
| **Q6** Feature flag at startup/request | Read on each personalization request, checked before sign-in; off behaves 404 | NJS-04 tests |
| **Q7** Python client timeout | **15s async job acceptance**; **270s local-direct `count=1` smoke only**; **240s per model invocation**; 25m job, 29m task deadline and 30m worker Cloud Run proposed | NJS-03 separate client timeouts, NEW-04 actual deployed settings |
| **Q8** Anonymous real-client access | No anonymous paid/real generation, even locally; local anonymous mock only | NJS-04/PY security |
| **Q9** Old session JWT after stable `sub` | Require reauthentication; don't infer provider subject from email | NJS-04A rollout |
| **Q10** Store for changing state | GCS JSON with `ifGenerationMatch` CAS, immutable events, Node authoritative writer; Cloud Tasks only dispatch. **Global create-once job-owner index** and **nonterminal pending index** support job-ID lookup, dispatch and recovery without listing all users (see §4.1A). | GCS-02A idempotency/CAS plus GCS-02B indexing/recovery tests |
| **Q11** Session creation | Lazy on first generation within board visit; Node-generated; board label not authorization until persisted | NJS-05 UX/behavior tests |
| **Q12** Other-user resource response | 404 to avoid ID probing, irrespective of existence | Node cross-user tests |
| **Q13** Model picker | Preserve existing controls when supported, explicitly reject unsupported model settings | PY-10 capabilities, FE QA |
| **Q14** `count=N` | N requested output slots, **not automatically N model attempts**; support 1–10 immediately | PY-LIVE/PY-12, real provider tests |
| **Q15** Auto-select Skills | Manual first, automatic later with Node authorization and version pin | PY-SKILL-AUTO later issue |
| **Q16** Skill version scheme | Integer versions + immutable `.md` + SHA-256 | NJS-07 |
| **Q17** Agent Skill version | Explicit version pin, no silent latest for Agent | NJS-09A |
| **Q18** Split NJS-09? | Yes: NJS-09A Agent, NJS-09B Brand | separate issues/PRs |
| **Q19** Agents/Brand screen IDs | Existing page/no design change: N/A with visual regression; new Skill picker references IMG-02/03/SKILL-01 | Luma `docx` **comparison not yet performed** |
| **Q20** FE receives feature flag | Safe capability field on existing `/api/auth-config` or equivalent config API; never Python URL | Node/FE implementation |
| **Q21** ON with refs before assets | Show unsupported input/action, or explicit user-selected old engine; **no silent fallback** | FE-SMOKE and NJS-10 |
| **Q22** Signed URLs vs binary proxy | Authenticated Node stream proxy approved; signed URLs not used for preview in this phase | NJS-13-LITE, security test |
| **Q23** Remove Firestore early | Yes Node runtime probe/SDK clean-up after inventory, preserving existing route; Python old paths isolated safely | NJS-14, PY-14 |
| **Q24** Guardrail entry shape | `{id,version,outcome}`; Skills have `reason_code` additionally | PY-07 fixtures |
| **Q25** Clarification status | First-class public `needs_clarification` + `clarification_required`, no paid call | PY-08, NJS-12 |
| **Q26** Who writes history | Node alone writes GCS state/events; Python reports actual attempts through authenticated callback | NJS-11/PY-12; BigQuery deferred |
| **Q27** Contract pinning | One canonical versioned fixture directory + hash, Git tags when shared repo exists | SH-01 co-sign |
| **Q28** Cookie as identity proxy | Audit auth design; fail closed if infra OIDC cannot be minted; no unverified cookie-as-Bearer forwarding | NEW-03 security sign-off |

**Other original clashes X1–X17:** X1 no Zod; X2 Express 400/Pydantic 422 mapped; X3 generation vs sign-in sessions separate; X4 GCS CAS mutable state; X5 upload legacy data URLs on first use; X6 Skill picker added; X7 model block added; X8 accurate attempts; X9 new route strict ratio while old unchanged; X10 share legacy limit constants without changing old behavior; X11 explicit timeouts; X12 free-text Brand `campaignContext`; X13 Agent version pins; X14 proxy hardening; X15 legacy auth error shape maintained; X16 local tests/PR evidence while CI off; X17 video untouched.

### Remaining honest implementation gates (not missing decisions)
1. **Person names** for integration DRI, Python co-lead, security reviewer, frontend/QA and product approver must be filled at kickoff.
2. **Luma Skill picker visual comparison** remains an actual design-review task; the document must not claim it was performed.
3. **Vertex model/region and exact feature capabilities** need real GCP validation; aliases/examples are not proof of availability.
4. **Cloud Tasks service identity, Cloud Run IAM/ingress, task 29m dispatch deadline, and ADC** need actual permission/setup validation.
5. **GCS-only state at production concurrency** is a controlled-phase tradeoff; CAS and reconciliation tests are required, and this design does not claim full database-equivalent semantics.
6. **No code/tests have been executed as part of writing this plan**. GitHub issues are drafts until filed; acceptance results must be attached by implementing teams.

---

## 14. Reviewer findings 1–9 — resolution and sign-off state

| # | Finding | Resolution location | Status |
|---|---|---|---|
| 1 | Local direct call conflicts with 15s acceptance | §3.1, §5.5A, §6.1, NJS-03/NJS-LIVE-01/LOCAL-ASYNC-01; 270s count=1 smoke and separate local async for 1..10 | **Specified; implementation untested** |
| 2 | Missing direct Python result | §5.5A: completed/failed/clarification envelopes and exact fixture names | **Specified; fixture files to be committed** |
| 3 | Mock job polls forever | §5.6: mock HTTP 200 + `pollingAllowed:false`, `statusUrl:null` and clear label | **Specified; frontend test required** |
| 4 | Missing callback fixtures | §5.5B/§5.8: started, slot failed, clarification and lease, existing output/final events | **Specified; both teams must materialize fixtures** |
| 5 | Lease duration/renewal missing | §4.2: 60s lease, 20s renewal, 30s grace, CAS fencing and no blind paid retry | **Specified; failure-injection test required** |
| 6 | HMAC key and storage unresolved | §4.1: versioned 256-bit HMAC v1 secret in Google Secret Manager, Node only, migration on rotation | **Proposed technical default; cloud security must approve** |
| 7 | Python Brand shape undefined | §6.5: pinned immutable resolved JSON, constraints, references and single selected Brand | **Specified; schema fixture tests needed** |
| 8 | Failed-slot retry undefined | §6.6: authenticated slot retry creates linked new job and IDs with safe reconciliation | **Specified; separate implementation acceptance required** |
| 9 | GCS retention undefined | §6.7: proposed 30d asset / 90d history+tombstone / 7d temporary and source-of-truth for last-used | **Proposed; cloud/security and privacy approval required** |

**Formatting fixes:** §4.2 status transitions now render as separate lines; all issue headings in §9 have full names, with no clipped code spans.

**Important distinction:** This historical reviewer register describes the baseline fixes across versions. The current v2.9 issue owners, dependencies and release gates are defined by section 9 and section 22, not by old version-specific wording. It does not claim the JSON fixtures have already been created in either repository, any Python endpoint has already been implemented, cloud permission checks have passed, or a real Gemini output has been generated. Node/Python technical leads must sign off on the same pinned contract before implementation is called complete.

---

## 15. Final v2.2 consistency fixes and sign-off checklist

This version reconciles the last review's **contract consistency**, not new product design. The items below are specified, not claims that endpoints or fixtures have been implemented in either repository.

| Last review item | Exact update in v2.2 | Team gate |
|---|---|---|
| Error table omissions | §5.7 now includes `lease_held` (409), `retry_reconciliation_required` (409), `retry_already_running` (409), `unsupported_execution_mode` (400), `asset_expired` (410), `stale_worker_lease` (409) and local `internal_auth_failed` (401); internal-only retry rules noted | NJS-02/PY-02 agree and test both status/error shape |
| Worker request/claim fixtures | §5.5E includes dispatch body/reply, claim-acquire request/reply, renew request, `attempt_finished`, `job_finalized`, stale callback and expected stale-worker 409 | SH-01 fixture publication, Node/Python tests |
| PY-03 vs PY-LIVE-01 same route | §5.5C: Python `PYTHON_GENERATION_BACKEND=mock` or `PYTHON_GENERATION_BACKEND=vertex` chosen **server-side**, mock permits count=1..10 without jobs or polling, real synchronous smoke only count=1; real asynchronous worker supports 1..10 | PY-03/PY-LIVE-01 mode isolation, no browser override |
| PY-LIVE-01 contradictions | §9 PY-LIVE-01 direct implementation/acceptance now count=1 only; multi-image count=1,3,10 explicitly moves to PY-10 + LOCAL-ASYNC-01 | issue owner updates GitHub body before filing |
| Local worker credentials | §5.5D and §10.4A: two local-only random tokens with fixed header, constant-time check, strict direction separation and production prohibition | LOCAL-ASYNC-01 security negative tests |
| Outdated Q1 / Q7 answers | §13 records mock non-polling HTTP 200 and distinct 270s direct smoke limit | two leads review cross-section wording |
| Status formatting | §4.2 status transitions are a standalone fenced diagram; stray literal HTML break tags removed/absent | Markdown renderer check |

**Mandatory sign-off checklist** (technical agreement, not automatic completion):

- [ ] Node.js integration lead and Python lead agree on one pinned contract hash, same fixture list, mock and real mode selection, error mappings and callback event shapes.
- [ ] Node and Python tests load the materialized shared fixtures, including stale leases, wrong local tokens, unsupported direct count>1, 1/3/10 async outputs, duplicate job delivery and no phantom mock assets.
- [ ] Python direct smoke calls an approved image-capable Vertex model in the actual region, saves one real output to the reserved GCS object and returns a complete direct result.
- [ ] Local async uses the separate dispatcher, 15-second acceptance, service tokens, lease fencing, authenticated callbacks and 1/3/10 output tests.
- [ ] Deployed Cloud Run/Cloud Tasks paths use OIDC and IAM; local secrets are disabled, and the workload is reconciled safely after uncertain timeouts.
- [ ] The actual named DRI, Python co-approver, frontend/QA owner and cloud/security contacts sign off; Luma design comparison, retention-policy approval and live model/IAM checks remain operational tasks.

**No new externally approved design choices are being asserted here.** The local service tokens and server-owned Python mode flag are recommended technical defaults to close the review's implementation gaps, subject to Node/Python/security review before deployment. No GCS writes, GitHub issue filing, cloud deployment, model generation or live E2E tests were performed while preparing this document.

---

## 16. Final v2.3 job-index and cross-section consistency corrections

The updates below close the final technical review of v2.2. They amend the **single unified plan**; they do not create a separate architecture or imply that any runtime implementation exists yet.

| Reviewer point | v2.3 resolution | Required verification |
|---|---|---|
| Global job lookup missing | §4.1/§4.1A: immutable `v1/index/jobs/{job_id}.json` links the opaque job ID to `owner_key` and `request_id`. All Node internal handlers resolve it first. | Payload/claim/events tests with job ID only, cross-user and fake-index rejection |
| Dispatch/recovery cannot find pending jobs | §4.1/§4.1A and GCS-02: create-once `v1/index/pending/{job_id}.json`, paginated listing, authoritative snapshot check, delete on terminal, stale-marker cleanup and admission crash recovery. | Restart, `dispatch_pending`, concurrent scanner, duplicate task and terminal cleanup tests |
| Node mock mode undefined | §5.5C/NJS-03/§10: Node `PERSONALIZATION_EXECUTION_MODE=mock` uses in-process fake without Python. Python's separate `PYTHON_GENERATION_BACKEND=mock` is for its own contract endpoint tests. Neither is available in deployed mode. | Prove no network/Vertex call for Node mock; Python mock real HTTP tests remain available |
| Obsolete version references | §14 and document header say v2.3, while §15 remains labeled as the historical v2.2 correction register. | No unqualified v2.1 claims remain |
| Local direct diagram confusion | §3.1 begins with CLI/supertest, not a browser; browser multi-image generation uses `local_async` and status polling. | Distinct direct count=1 and browser async count=1/3/10 tests |
| Inconsistent lease fixture values | §5.5/§5.5B/§5.5E use positive fixture token `FIXTURE_ONLY_LEASE_TOKEN_001` with fencing token `7`; negative stale fixture uses `6` and a different token. | Positive and negative fixture tests share one starting state |
| Unexplained local async response fixtures | §5.8 specifies `response.local_async.accepted.json` as the §5.4 202 envelope, and `.terminal.json` as the §5.6 200 status envelope. | Byte-equivalent or schema-equivalent fixture references checked |
| Status-flow Markdown spacing | §4.2 has a blank line before its standalone fenced status-transition diagram. | Markdown preview/rendertest |

**Final handoff:** both leads should sign the same versioned contract after shared fixtures are created and run. This is a design artifact, not proof of live Google Cloud, UI or integration testing. Named owners, Luma comparison, Vertex model access, Cloud Run IAM and retention-policy approval are still operational sign-off gates.


## 17. v2.4 direct-smoke, retry-index, QA and Claude handoff corrections

| Reviewer clarification | Final rule | Tests / issues |
|---|---|---|
| Direct one-image smoke index creation | **No global owner or pending index** is created in isolated `local_direct_smoke`; its owner and output reservation are known from its authenticated synchronous request. No async status lookup or dispatch. | NJS-LIVE-01, PY-LIVE-01, T37 |
| Retried failed image produces a new job | **Both indexes** are created for a new child async job through the full §4.1A admission/idempotency/CAS flow. Original job stays terminal. | NJS-12, GCS-02, ASYNC-01, T34/T37 |
| Global job lookup/recovery test missing | Added **T37** to the main QA test matrix, including owner lookup without an owner argument, mid-admission crash, orphan/stale marker cleanup, direct-mode isolation, retry-job indexing and index owner format. | GCS-02, LOCAL-ASYNC-01, NJS-15 |
| Example owner key invalid | Changed fixture example to `u1_0123456789abcdef0123456789abcdef` throughout, with an explicit strict regex. This is a placeholder **format**, not a real owner key. | SH-01, NJS-04A, GCS-02, T35/T37 |
| Issues too short to hand Claude | Every issue in §9 now has an expanded, issue-specific Claude implementation handoff: code locations, proposed files, steps, test cases, security/regression checks and measurable acceptance criteria. | All 49 issue IDs, before GitHub filing |

**Approval still required:** technical leads must approve the pinned contract; the owner names, Luma screen comparison, Vertex model/region access, IAM tests and retention/privacy policy remain implementation or organizational gates. The document is a specification, not evidence of completed code or deployed resources.


## 18. v2.5 Claude handoff dependency and contract corrections

The v2.4 review identified dependency ordering problems that would block a literal Claude implementation. **These are binding fixes to §9, not new feature scope.**

| Finding | Corrected, authoritative implementation contract | Reviewer test |
|---|---|---|
| GCS output writer ordered after the live route | **PY-OUTPUT-01 now precedes PY-LIVE-01**, depends on GCS-01/NJS-02/PY-02, uses image-byte fixtures without Vertex. PY-LIVE-01 depends on and reuses the writer. NJS-LIVE-01 explicitly depends on both. | Code is importable and upload fixture succeeds before calling Gemini; no cycle. |
| Local async requires image planning | **LOCAL-ASYNC-01 depends on PY-10** and tests 1/3/10 outputs only after that issue lands. | Dependency graph and test results. |
| No owner for private Node endpoints | **GCS-02 owns Node `/payload`, `/claim`, `/events`** (registration, guarded handler, CAS leases, event dedupe, contract tests). LOCAL-ASYNC-01 adds local worker/credential integration; ASYNC-02 adds deployed OIDC integration without creating Node handlers. | Contract tests call each real handler by `job_id` only, with valid/invalid principal and stale lease. |
| Invalid `mocked` status instruction | NJS-02 defines `executionMode: "mock"` and a non-polling test-only mock reply; the public job state remains exactly six values. | TS schema accepts mock fixture, rejects invented seventh status. |
| Extra Skill field | NJS-08 forwards exactly `{skill_id,version,sha256,content,selection_mode}`; no unapproved `source`. | Schema rejects uncontracted key when strict. |
| Example owner key invalid | All literal output/input GCS examples now use `u1_0123456789abcdef0123456789abcdef`, matching `^u1_[0-9a-f]{32}$`. | Parse all code-block JSON and validate every fixture owner token. |
| Markdown wildcards and enum rendering | Wrap Python `*.py` paths and `NEW-*` / `SH-*` heading literals in backticks; present `mock` and `vertex` as separate explicit values; status diagram remains a standalone block. | Markdown preview and static content checks. |
| Direct smoke accidentally used by canvas | NJS-04 explicitly limits `local_direct_smoke` to authenticated CLI/test harness, `count=1`, rejects larger counts and does not connect the browser canvas to the 270s request. | Count=3 yields 400 and browser uses local_async 202/poll instead. |

**Sign-off conditions:** Node and Python leads approve the same pinned contract/fixtures; the running code still needs real integration tests. Named role owners, Luma Skill picker comparison, Vertex model/region access, GCP IAM, and retention approval are outstanding operational gates. No GitHub issues should be filed from an older, contradictory issue body.

## 19. v2.6 dependency split and single-owner implementation corrections (historical register)

**Status:** normative update of section 9 issue scopes; this replaces the single former `GCS-02` issue with two issues. Historical v2.5 references to `GCS-02` in sections 14-18 describe prior versions and must not be copied into new GitHub issues.

| Review problem | v2.6 implementation decision | Owner and merge gate |
|---|---|---|
| Single GCS-02 too large for first real smoke | Split into **GCS-02A** minimal GCS CAS, authorized output reservations, asset manifests and 7-day replay/conflict service, and **GCS-02B** indexed async job admission, internal routes, leases and recovery | `GCS-02A` before `NJS-LIVE-01`; `GCS-02B` before `LOCAL-ASYNC-01` and `ASYNC-01` |
| Missing approved contract prerequisite | Both new GCS issues explicitly depend on NJS-02; GCS-02B also depends on GCS-02A; NJS-04 is a live integration gate, not a private-route merge prerequisite | Node lead checks fixture hash before merge |
| Duplicate owner for public status route | **LOCAL-ASYNC-01 creates** authenticated `GET /api/personalization/jobs/:jobId` and its minimal six-status polling response. **NJS-12 extends** that same registered route with full error mapping and failed-slot retry endpoint. | FE-SMOKE-01 can poll before NJS-12; no duplicate route registration |
| Duplicate owner for 7-day replay handling | **GCS-02A implements** canonical fingerprint, GCS conditional create, 7-day replay/conflict and tombstones. **GCS-02B, LOCAL-ASYNC-01, ASYNC-01 and NJS-12 reuse it**. **NJS-11 adds only request/invocation/output history**, never a second replay filter. | Same-key double click is protected before FE-SMOKE-01 ships |

**Tests required before moving to canvas work:** GCS-02A handles same-key/same-payload concurrent requests with one job ID, 409 conflict for changed payload, and seven-day boundary tests (T03/T04/T14); GCS-02B verifies indexes, owner lookup, internal service authentication, lease/fencing, admission crashes and T37; LOCAL-ASYNC-01 verifies the first status GET, 1/3/10 counts, and authentication; NJS-12 only adds richer status errors and child retry. The initial `local_direct_smoke` `count=1` remains independent of indexes.

**Historical v2.6 critical path (superseded by §20):** `GCS-01 + NJS-02 + NJS-04A -> GCS-02A -> NJS-LIVE-01` (plus Python writer/live and NJS-03/04). In parallel: `GCS-02A + NJS-02 + NJS-04 -> GCS-02B -> LOCAL-ASYNC-01 (plus PY-10) -> FE-SMOKE-01`. Deployed Cloud Tasks `ASYNC-01` and `ASYNC-02` consume the existing state/worker interfaces; `NJS-11` and `NJS-12` extend them later. This is a proposed merge schedule, not proof of implementation.

## 20. v2.7 final implementation simplification and verification register

The reviewer-reported GCS-02 split, duplicate status-route ownership and duplicate idempotency owner were **already fixed in v2.6**. v2.7 retains those fixes, makes all authoritative issue scopes consistent, and replaces unnecessary merge ordering with fixture-driven parallel implementation.

| Concern | v2.7 binding resolution | Owner |
|---|---|---|
| First real image blocked by full async state infrastructure | `GCS-02A` is the only Node GCS reservation prerequisite for `NJS-LIVE-01`; `GCS-02B` is explicitly excluded. Python writer is built before its live endpoint. | Node + Python |
| GCS-02B private routes need contract | Direct hard dependency on `NJS-02` retained, and `GCS-02A` reused. Removed unnecessary `NJS-04` private-route gating. | Node |
| Duplicate status implementation | LOCAL-ASYNC-01 owns GET; NJS-12 extends only, adds single-slot retry/error mapping. | Node |
| Duplicate replay/idempotency implementation | GCS-02A owns seven-day key+fingerprint+GCS CAS; consumers import it; NJS-11 only accounts real attempts/outputs. | Node |
| Overly coupled Python and frontend work | Python input loader and Skills/policy/understanding accept pinned fixtures independently from corresponding Node UI/server PRs. E2E gates explicitly listed above. | Python + Node |
| Deployed producer unnecessarily blocked by local worker | ASYNC-01 producer tests with fake worker; ASYNC-02 secured worker reuses LOCAL-ASYNC-01 Python worker. Deployed **enablement**, not individual PR merging, requires both and IAM. | Node + Python |
| Accounting and retry forced to wait for deployment | NJS-11 projections use GCS-02B fixture events; NJS-12 extends LOCAL-ASYNC-01 status and uses GCS-02A/B retry admission. Real deployed cases are later quality gates. | Node |
| Brand images used before assets exist | NJS-09B permits text-only Brand profile versioning; no unverifiable image reference can be accepted before NEW-01. | Node |

**Validation scope:** all 50 issue IDs and expanded handoffs remain; direct dependency graph has no unknown IDs or cycles; shared JSON examples remain parseable. This document does not claim any service deployment, IAM grant, actual Vertex run, or GitHub issue creation. Named lead approvals, Luma UI comparison and retention authorization remain open operational gates.



## 21. Historical v2.8 integration review — superseded ownership/dependency notes (see v2.9 section 22)

**Historical-only basis:** `Pasted markdown(1).md` reviewer report against `main` commit `9251e34` (reviewer says code was inspected but not run) and the available uploaded repository ZIP snapshot. Newer `@skill` implementation may not exist in that older ZIP; Claude must verify actual branch state before modifying code. **These are requirements in the implementation plan, not changes already landed in any repository.**

| Reviewer finding | One issue owner | Exact fix | Required test |
|---|---|---|---|
| 1. `<img>`/Konva cannot attach bearer | FE-SMOKE-01 (frontend); NJS-13-LITE (backend bytes) | Existing authenticated helper fetches Blob, creates temporary object URL; server verifies asset owner; persist only asset IDs. No accepting raw session cookie as proof of identity. | T38, T41 |
| 2. Next.js proxy `req.text()` damages uploads / strips headers | **NEW-03** shared proxy; **NEW-01** upload validation | Binary-safe proxy request+response, safe header allowlist, route-specific raw upload max 10 MiB and byte-identity tests. | T39 |
| 3. All deployed IAP anonymous users share an owner | **NJS-04A** | Reject paid personalization and private asset/job reads until stable, verified individual identity is present. Verified IAP JWT is a separate future mode. | T40 |
| 4. Canvas doesn't persist GCS output lifecycle | **FE-SMOKE-01** | Typed `gcs_asset` node state; durable job/output IDs, reload recovery, authorized previews, undo/drag/download and bounded legacy reference conversion. | T41 |
| 5. `@skill` mentions already exist on newer main | **FE-02** UI; **NJS-08** resolver | Reuse mentions, add picker without replacing it; dedupe and enforce new 5/300KiB/30k limits on combined personalization selection; feature OFF retains older limits. | T42 |
| 6. Two job APIs and an unprefixed retry path | **LOCAL-ASYNC-01** first status GET; **NJS-12** extends, **FE-SMOKE-01** distinct client | Preserve legacy `getJob()`; add `getPersonalizationJob()`; canonical retry path `/api/personalization/jobs/:jobId/slots/:slot/retry`. | T43 |
| 7. Bucket env, GitHub template and mocks diverge | **GCS-01** bucket setup; **NJS-01** inventory; template check on every issue | Start with existing `GCS_BUCKET_NAME` single private dev bucket; explicit optional multi-bucket configuration; use real template and document distinct legacy/new mocks. | T44, T45 |

### 21.1 Historical scope and dependencies (superseded by section 9.0 and 22)

- **Historical v2.8 statement (no longer operative):** No new GitHub issue IDs were required at that time; 50 were present. To make binary paths deliverable, `NEW-03` is a **hard code merge prerequisite of `NEW-01` and `NJS-13-LITE`**. `FE-SMOKE-01` already depends on `NJS-13-LITE` and so inherits tested transport, without redundant dependency links.
- `NJS-04A` stays a prerequisite of user-owned GCS reservations through `GCS-02A` and therefore input/output ownership. Python Skill/Vertex development does **not** wait for frontend proxy work; use pinned SH-01 fixtures to develop independently. `NEW-03-TRANSPORT` can merge as tested transport before local preview; `NEW-03` can run in parallel and is a deployed release/security gate, not a local transport code blocker.
- **Do not duplicate** shared proxy code in NEW-01/NJS-13-LITE; do not add another job status handler in NJS-12; do not rebuild idempotency in NJS-11; do not build a second Skill resolver in FE-02.
- The v2.7 historical direct-edge count (72) was a snapshot; v2.8 adds exactly **two** necessary direct dependencies (`NEW-01 → NEW-03`, `NJS-13-LITE → NEW-03`) for **74 direct edges**, assuming the existing graph is otherwise unchanged. Lower dependency count is not a reason to remove security/transport prerequisites.

### 21.2 Claude issue instructions (paste with every affected v2.8 issue)

1. Confirm repository `HEAD`, existing target paths and `CLAUDE.md` *before* changing code. Reviewer findings from newer main take precedence over assumptions based on an older ZIP only after checked-out code verifies them.
2. Follow the current `.github/ISSUE_TEMPLATE/canvas-feature.md`: Screen IDs (or `N/A`), User story, independently testable Acceptance criteria, UI states, zoom invariance (or backend `N/A`), Out of scope and Definition of done. Retain Owner, hard dependencies, scope, evidence and cross-team handoff in the issue body.
3. Implement exactly the one owner's functionality defined in section 21 table and the corresponding **v2.8 mandatory Claude implementation addendum** in section 9. Do not silently modify the legacy Create Image route, existing jobs or auth.
4. Verify source code with relevant backend tests, typechecks, security/negative cases, frontend Playwright at 50/100/150% zoom where applicable. QA must capture **T38–T45** and the previously defined T01–T37 tests.
5. Document `git diff --name-only`, actual commands/results, integration fixture SHA/hash, feature flag rollback, and any blocked cloud/Luma conditions. Do not claim GCS, Vertex, Cloud IAM or running E2E tests were performed unless there is evidence.

### 21.3 Historical ready-for-sign-off checks (v2.9 updates in section 22)

- [ ] Node and Python leads confirm the same v1 request/response/error contract and model operation settings.
- [ ] Node lead reviews binary transport for NEW-03-TRANSPORT and auth release gate NEW-03, asset rendering for NJS-13-LITE and persistent canvas asset state for FE-SMOKE-01.
- [ ] Security approves IAP anonymous rejection, trusted user/infra boundary and least-privilege private GCS access.
- [ ] QA agrees to T38–T45 and legacy-off regression tests.
- [ ] Current repository verifies reported `@skill` mention implementation and Luma picker design is compared before UI approval.
- [ ] Cloud owner confirms GCS env configuration, model/region availability, service account IAM and retention policy.

**Document sign-off is not code completion:** these items are specification fixes; implementation is carried out in the associated GitHub issues and measured by tests.

---

## 22. v2.9 binding final corrections: retention, mock rule ownership, independent transport, Skills, dependencies and local auth

**Priority:** The 51 detailed issues in section 9, the full dependency snapshot in section 9.0, and this section govern implementation. Sections 14-21 remain historical audit information. **This document defines changes for Claude to implement; no application fix or live cloud test has been performed by editing it.**

### 22.1 Issue ownership and release gating

| Finding | Single implementation owner | Mandatory result | Test IDs |
|---|---|---|---|
| Asset retention versus browser-only board | **NJS-13** | Successful owner-authorized content GET touches `last_used_at` using GCS CAS, throttled once/24h; no automatic pin from browser localStorage; 30d inactivity expiry is an explicitly approved policy with 410 behavior. | T36/T41/T46 |
| `CLAUDE.md` mock-rule ambiguity | **NJS-03** | Actual edit to rule 3 in the same PR; legacy missing-key placeholder retained; explicit personalization mock is never a live fallback. | T31/T45 |
| Binary proxy transport was blocked by security approval | **NEW-03-TRANSPORT** | Own independent byte-for-byte upload/response forwarding and headers; local code can merge after transport tests. | T39 |
| Deployed token/cookie hardening | **NEW-03** | Fail closed, preserve verified identity, explicit cloud/security approval **before deployment**. Not a hard merge dependency for NEW-01 or NJS-13-LITE. | T40/T47 |
| Browser-only Skills cannot be resolved in Python | **FE-02** | `@skill`/picker detects unsaved local Skill and shows "Save this Skill first"; only saved owner-authorized IDs go to NJS-08. | T42/T49 |
| No local direct service token until local async | **NJS-03 + PY-03** | Node sends and Python verifies separate local-only service token on direct route **before PY-LIVE-01**, constant-time verification, cannot authenticate deployed calls. | T24/T48 |
| Final integration PR missing gates | **NJS-15** | Hard prereqs include ASYNC-01, NJS-09B, FE-BRAND-01, PY-09, NJS-11 and PY-12; security and actual cloud testing are explicit release gates. | T01-T49 |

### 22.2 Dependency rules for Claude

- **Local canvas path:** `NEW-03-TRANSPORT` is a direct prerequisite of `NEW-01` and `NJS-13-LITE`; its unit/integration tests can merge without cloud/security sign-off. `FE-SMOKE-01` inherits the transport through `NJS-13-LITE`. `NEW-03` handles trust hardening separately and is still mandatory before deployed traffic. Never enable deployed traffic solely because local binary transport passed.
- **Direct real smoke:** NJS-03 and PY-03 own local service authentication. PY-LIVE-01 must not call the model via an unprotected direct endpoint. The CLI test uses the same locally configured token; the browser never receives it.
- **Async:** GCS-02A owns idempotency/slot reservation, GCS-02B owns indexes/leases/private routes; LOCAL-ASYNC-01 owns the first `GET /api/personalization/jobs/:jobId`, and NJS-12 extends it. ASYNC-01 uses existing job admission instead of implementing a second one.
- **Release:** NJS-15's direct dependencies are spelled out in its own issue. Security sign-off for NEW-03, actual Vertex/model access, IAM, retention approval and Luma screen comparison remain release checks; these approvals are not fabricated as completed work.

### 22.3 User-facing retention limits

Until server-side board persistence or explicit durable asset pins are introduced, **an image referenced only by an offline browser board can expire**. In particular, "not deleted while a board needs it" is **not** an implementable guarantee in the present architecture. Node's authorized image fetch renews activity timestamp at most once per day; the proposed retention cleanup (if approved) uses latest `last_used_at`, not GCS creation-age deletion. The user must receive `410 asset_expired` and a recoverable UI state when an asset is gone. The approval of data retention/deletion rules remains with security/privacy and cloud administration.

### 22.4 Final pre-filing checklist

- [ ] Confirm section 9.0 contains exactly the issued IDs, each target and all hard merge dependencies; no missing targets or cycles.
- [ ] Update all 51 issues to the actual `.github/ISSUE_TEMPLATE/canvas-feature.md` structure; preserve `N/A` for backend UI, zoom, and screen fields.
- [ ] Confirm `NEW-03-TRANSPORT` is independently mergeable without the NEW-03 security approval; only the deployed release gate requires security sign-off.
- [ ] Verify NJS-13 and FE-02 acceptance include T46/T49 and exact error/UX semantics.
- [ ] Verify NJS-03 `CLAUDE.md` edit and PY-03 local token test are actual PR tasks; no phantom unauthenticated direct route.
- [ ] Validate real repository HEAD against inspected older snapshots, run the relevant tests, and record real results before claiming a fix implemented.

---

## 23. v2.10 final consistency corrections and pre-filing gate

**Scope of this release:** Documentation and Claude issue-handoff corrections only. These changes have **not** been applied to either application repository, nor have cloud permissions or live generation been verified. All work remains subject to the same cross-team contract and actual PR tests.

### 23.1 Binding corrections

| Finding | v2.10 correction | Required evidence before issue filing / PR merge |
|---|---|---|
| Conflicting P2 dependency table | Removed the duplicate P2 table. **§9.0 is the sole canonical issue-dependency graph** (51 issues; 82 direct edges). | Check every issue's Depends on line against §9.0; prevent reintroducing a second graph. |
| Python live endpoint missing its route/token prerequisite | **PY-LIVE-01 depends on PY-03**, which owns `/v1/generation/execute` and its local service-token authentication; Python live issue extends the protected route, never creates an unsecured alternate route. | PY-03 local unauthorized test passes before PY-LIVE-01; count=1 actual Vertex/GCS test follows. |
| Proxy transport owned by two issues in old addenda | **NEW-03-TRANSPORT** is the single implementer of binary-safe forwarding and response-header handling, consumed by NEW-01 and NJS-13-LITE. **NEW-03** solely handles deployed identity/security approval. | Run T39 for transport independently; T47 and security sign-off gate deployed rollout. |
| v2.8 issue count | All filing instructions now refer to **51** v2.10 issues. | Compare 51 IDs in §9.0 to 51 section 9 issue headings. |
| Ambiguous GCS binary folder naming | One private dev bucket, state at `v1/index/` + `v1/users/`, binary inputs at `v1/inputs/`, binary outputs at `v1/outputs/`. The configuration uses `GCS_BUCKET_NAME`; separate buckets are an explicit optional later configuration. | GCS-01 tests the same object names as §4.1; Node reservation and Python writer fixture paths match. |
| NJS-15 limited test range | NJS-15 handoff and acceptance reference **all T01–T49**, including T38–T49. | QA captures results for every test, including required staging/security sign-offs. |
| T46–T49 detached from matrix | Folded T46–T49 into the single §10.7 Markdown table. | Markdown renders one contiguous T01–T49 test matrix. |
| LOCAL-ASYNC-01 route file omitted from handoff | Proposed `backend/src/routes/personalizationJobs.ts` now appears in the files-to-create list and implementation steps. | The issue owns exactly one authenticated `GET /api/personalization/jobs/:jobId`; NJS-12 extends it rather than registering a duplicate. |

### 23.2 Implementation discipline for both Claude teams

1. **Follow §9.0, not historical tables or review logs.** The P0–P5 order is for readability, not a universal merge chain. Parallel work is permitted with contract-pinned fixtures.
2. **Do not bypass PY-03.** Local direct image generation is `count=1`, authenticated with the agreed local-only service token. Real asynchronous 1–10-image tests require PY-10 + LOCAL-ASYNC-01; deployed tasks require Cloud Run IAM/OIDC security gates.
3. **Respect single ownership:** NEW-03-TRANSPORT owns binary proxy changes; NEW-03 security hardening; GCS-02A reservations + seven-day idempotency; GCS-02B worker indexes/private callbacks; LOCAL-ASYNC-01 initial job GET; NJS-12 extensions and slot retries; NJS-11 historical attempt/output accounting.
4. **Before filing**, convert each detailed issue to `.github/ISSUE_TEMPLATE/canvas-feature.md` with Screen IDs, UI states, zoom checks (or backend N/A), numbered acceptance criteria, exact checked-out paths, explicit owner, out-of-scope, tests, and dependency list copied from §9.0.
5. **Before code completion claims**, run the actual repository test/typecheck commands and record results. The 49 example test IDs define required evidence, not claims that tests already passed.

### 23.3 Outstanding implementation approvals (not unresolved architecture)

Actual team owner names; Luma Skill-picker design comparison; the real Vertex model and region; GCS, Cloud Run and Cloud Tasks IAM; retention/security approvals; pinned cross-team fixtures and live smoke evidence.

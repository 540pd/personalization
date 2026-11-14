# GCOS Personalization — Integration Issue Backlog (draft)

> **Status:** draft backlog for review. **Nothing here is filed on GitHub yet.**
> Each entry is written so it can later be copied into `.github/ISSUE_TEMPLATE/canvas-feature.md`
> and raised as one issue (one feature per issue, per `CLAUDE.md`).
>
> **Sources (in `docs/`):**
> 1. `GCOS_Shared_Independent_Teams_Integration_Plan.docx`: the agreement between the two teams (the "Shared Plan")
> 2. `GCOS_NodeJS_Frontend_Claude_Implementation_Issues.docx`: NJS-01 … NJS-15 (the "Node doc")
> 3. `GCOS_Python_FastAPI_Claude_Implementation_Issues.docx`: PY-01 … PY-15 (the "Python doc")
>
> **Validated against:** this repo at `main` = `a9885d6` (2026-10-23). The Python/FastAPI repo is **not**
> in this workspace, so PY-* items are checked only against the docs and the shared request/response format, not against their code.

---

## Contents

1. [How to read this file](#1-how-to-read-this-file)
2. [The three documents in brief](#2-the-three-documents-in-brief)
3. [Decision log (already agreed)](#3-decision-log-already-agreed)
4. [What the current repo actually looks like](#4-what-the-current-repo-actually-looks-like)
5. [Cross-cutting clashes and risks](#5-cross-cutting-clashes-and-risks)
6. [Backlog overview](#6-backlog-overview)
7. [Node.js / Frontend issues (this repo)](#7-nodejs--frontend-issues-this-repo)
8. [New issues proposed by this review](#8-new-issues-proposed-by-this-review)
9. [Python / FastAPI issues (other team)](#9-python--fastapi-issues-other-team)
10. [Shared / cross-team issues](#10-shared--cross-team-issues)
11. [Master list of open questions](#11-master-list-of-open-questions)
12. [Suggested milestones and order](#12-suggested-milestones-and-order)

---

## 1. How to read this file

Each issue has these sections:

| Section | Meaning |
|---|---|
| **Source** | Where the issue comes from (doc + ID) or "proposed by review" |
| **Readiness** | 🟢 Ready to file · 🟡 Needs decisions first · 🔴 Blocked by missing groundwork |
| **Objective** | One sentence: why the issue exists |
| **Repo check** | What the code says today, with real file paths |
| **Scope / Out of scope** | What the issue includes and excludes |
| **Tasks** | Implementation steps |
| **Acceptance criteria** | Numbered, each one testable on its own (the format `CLAUDE.md` requires) |
| **Template fields** | Screen IDs and UI states for the issue template. Backend-only issues say *N/A — backend only* |
| **Dependencies** | Issues that must land first |
| **PR** | PR title prefix. `[k/N]` marks a dependent chain (per the team's PR rule) |
| **Questions & my view** | Unresolved points, each with a recommendation |

Every issue also carries the `CLAUDE.md` definition of done: `npx tsc --noEmit` clean in both packages,
`git diff --name-only` shows only in-scope files, no console errors, and canvas features tested at 50/100/150% zoom.
**GitHub Actions CI is currently off**, so all checks run locally and their results go in the PR.

---

## 2. The three documents in brief

### 2.1 Shared Plan: the agreement between the teams
- **Separate repos.** Next.js/Konva UI + Express (this repo) and Python FastAPI stay apart. They talk only over HTTP, using shared example JSON files. **No Campaign or Audience features.**
- **Who owns what:** Node.js owns sign-in, permissions, boards and sessions, saved settings, access to GCS assets, and all responses to the browser. FastAPI owns prompt understanding, guardrails, applying Skills, prompt enhancement, running workflows/models, and checking outputs.
- **Storage:** GCS holds image and Skill files. BigQuery holds history and reporting data. **Firestore is removed through a tracked migration, and nothing new may use it.**
- **Terms:** a *session* is separate from sign-in. A *request* is one user action. An *attempt* is one real model call, including retries. IDs and idempotency must be preserved end to end.
- **Request format v1:** browser → Node.js `POST /api/personalization/execute`; Node.js → Python `POST /v1/generation/execute`. The doc defines the request fields, success and error responses, and the meaning of status codes. v1 may answer synchronously; production moves to `202` + `job_id`.
- **Stages A–E:** A, both sides build against fakes. B, publish the API docs and contract tests. C, local run on `:4000`/`:8000`. D, send real traffic behind a feature flag. E, connect GCS and BigQuery, then remove Firestore.
- **Rollback:** turn off `PERSONALIZATION_PYTHON_ENABLED`. Never silently switch to another model.
- **GCS layout:** `originals/…`, `generations/{tenant}/{session}/{request}/{attempt}/{asset}`, `skills/{tenant}/{skill_id}/{version}`. Objects are private, accessed via signed URLs or a proxy.
- **BigQuery tables:** `generation_sessions`, `generation_requests`, `generation_attempts`, `generation_outputs`, `skill_versions`, `agent_versions`, `brand_versions`, `asset_catalog`, `usage_events`. **BigQuery is not a transactional store.**
- **Exit criteria:** no regression in the Create Image node, saved Skills arrive with a verifiable hash, vague prompts are improved within limits, request/attempt counts are accurate, failures are predictable, and no Firestore remains.

### 2.2 Node doc: NJS-01 … NJS-15
Fifteen granular issues for this repo, each with suggested files, tasks, acceptance criteria, dependencies and a standard "Claude handoff" note.

- **Foundation:** review the code → request format → fake Python client → secure endpoint.
- **Data on the server:** generation sessions → canvas assets as GCS IDs → versioned Skills → passing Skills to Python → Agents and Brand.
- **Product:** Create Image panel behind a flag → request vs attempt counts → job status and errors → output catalog and preview.
- **Close-out:** remove Firestore → end-to-end test.

### 2.3 Python doc: PY-01 … PY-15
The matching fifteen for the FastAPI service.

- **Foundation:** review the pipeline → Pydantic request format → fake endpoint.
- **Building the prompt:** a session context object with no campaign needed → reference images from GCS → Skills with recorded provenance → a separate guardrail layer → one multimodal call to understand vague prompts → building the final prompt package.
- **Running and recording:** run image operations → save outputs to GCS → record attempts and usage → secure service-to-service calls.
- **Close-out:** remove Firestore and campaign code → publish the handoff and smoke tests.

---

## 3. Decision log (already agreed)

Agreed in review (2026-10-23). They apply to every issue below.

| # | Decision | Applies to |
|---|---|---|
| D1 | **Hand-written validation**, following `backend/src/common/validation.ts`. **No Zod** (`CLAUDE.md`). | NJS-02+ |
| D2 | **HTTP 400** for validation failures at the Node.js boundary. Python's internal 422 is mapped to 400 by the client. | NJS-02/03/04 |
| D3 | **No `tenant_id` in v1.** Use the signed-in identity. Add a stable provider ID (`sub`) before any data is stored per user. | NJS-02, NJS-04A |
| D4 | **`board_id` optional and nullable in v1.** A board ID sent by the browser is never proof of access. | NJS-02/04 |
| D5 | **One official request/response format.** Long term: a `gcos-api-contracts` repo. Until then, `docs/contracts/generation/v1/` in this repo. No two editable copies. | NJS-02, SH-01 |
| D6 | **NJS-01 produces `docs/integration/inventory.md` in a PR**, not an issue comment. | NJS-01 |
| D7 | **Getting the OIDC token is part of NJS-03** (tested with mocks). Real authenticated calls start only once Python verifies tokens (PY-13). | NJS-03 |
| D8 | **Feature flag behaviour:** flag off → **404** everywhere. Local + on + no URL → fake client. Local + on + URL → real client. Prod + on + no URL → **503**. Prod + on + URL → authenticated real client. This affects only the new endpoint, and the server never crashes. A failing real service never falls back to the fake. | NJS-03/04 |
| D9 | **NJS-04A, stable user identity (`sub`)**, is a separate issue and must land before NJS-05. | NJS-04A |
| D10 | **Success response v1:** `schema_version, request_id, session_id, node_id, status, enhanced_prompt, applied_skills, applied_guardrails, outputs[{asset_id,gcs_uri,mime_type}], usage{input_tokens,output_tokens,estimated_cost}, timings{total_ms}`. The fake and real clients return the same shape. | NJS-02/03 |
| D11 | **Only `create_image`** in the first milestone (not `generate`). Other operations are added later by agreed format updates. An unknown operation gets 400. | NJS-02/04, PY-02/10 |
| D12 | **`schema_version: "1"`** in requests and responses, checked by both sides. **`idempotency_key`** is listed as a planned optional field, not sent yet. | NJS-02, NJS-11 |
| D13 | **Node.js always generates `request_id`.** The browser doesn't control it. Python returns the same ID and logs it. `attempt_id` comes later. | NJS-02/04, PY-12 |
| D14 | **New nested error format only on the personalization route:** `{ error: { code, message, details[], retryable }, request_id }`. Every other route keeps the legacy `{ error, message }`. Sign-in errors on the new route stay legacy too. | NJS-02/04/10 |
| D15 | **Feature flag checked before sign-in.** Reuse the existing production check (`NODE_ENV=production` or `K_SERVICE`). **Anonymous deployed mode is refused on the new endpoint.** Anonymous local mode is allowed only for controlled fake-client testing. | NJS-04 |
| D16 | **Reuse `VALID_ASPECT_RATIOS_V2` and `MAX_VARIANTS = 10`.** Timeout is configurable and below Cloud Run's request timeout. A timeout → **504**, `retryable: true`. **No automatic retries** in NJS-03/04. | NJS-03/04 |
| D17 | **PR plan:** NJS-01 alone · NJS-02 `[integration 1/3]` · NJS-03 `[integration 2/3]` · NJS-04 `[integration 3/3]` · NJS-04A alone. | — |
| D18 | **First milestone:** Node.js → fake Python client → structured response. No frontend changes. | M1 |

---

## 4. What the current repo actually looks like

These facts drive most of the questions below. Every one was checked in code.

### 4.1 Backend (`backend/src/`, about 1,150 lines excluding tests)
| Area | Current state | Path |
|---|---|---|
| App factory | `createApp()`; port only bound when run directly; `/api/health` probes Firestore **or** GCS | `server.ts` |
| Routes | `authConfig`, `session` (`POST /session/refresh` = **sign-in** session), `boards`, `generate`, `assets` | `routes/*.ts` |
| Sign-in | `requireIdentity()` → `req.identity = { email }`. Anonymous mode when OAuth is unset locally, **or** when deployed with `AUTH_MODE=anonymous` + `IAP_PROTECTED=true`. Email-domain allow-list (default `accenture.com`) | `middleware/requireIdentity.ts` |
| Session token | 30-day JWT whose payload is **only `{ email }`** | `lib/sessionToken.ts` |
| Identity users | `req.identity.email` is read in **8** places | various |
| Boards | **In memory** (`_boards[]`), lost on restart. Fields: `id, userId, name, createdAt, updatedAt`. Firestore wiring is `TODO` | `lib/boardStore.ts`, `services/boardService.ts` |
| Firestore | 14-line client wrapper. **Only real caller is the `/api/health` probe.** `@google-cloud/firestore` is still a dependency | `lib/firestore.ts`, `server.ts` |
| GCS | `isGcsMode()` / `getBucket()` on `GCS_BUCKET_NAME`. **Nothing writes to GCS** | `lib/gcs.ts` |
| Assets | `GET /assets` returns `[]`; `DELETE` does nothing (stubs) | `routes/assets.ts`, `services/assetService.ts` |
| Image generation | `POST /generate/image`: `modelId` allow-list, `instruction`, `aspectRatio`, `quality`, `thinking`, `temperature`, `grounding`, `references`, `variants` (1–10, strict). **Unknown `aspectRatio` silently becomes `"1:1"`** (not rejected). `VALID_ASPECT_RATIOS_V2` and `MAX_VARIANTS` are **module-private** (not exported) | `routes/generate.ts:100-205` |
| Variants | N variants = **N separate model calls** (`Promise.allSettled`); partial success allowed | `services/generationService.ts` |
| References | Image references arrive as **data URLs** (`{ kind:"image", url }`) | `capabilities/types.ts` |
| Jobs | In-memory `jobStore`, video only, 1h TTL, scoped by user | `lib/jobStore.ts` |
| Errors | Legacy `{ error: string, message }`. `sendValidationError` → 400. Global handler → 500 | `common/errors.ts` |
| Mock mode | No `VERTEX_PROJECT_ID` → placeholder image, no crash | `docs/deployment.md:124` |
| Tests | vitest + supertest; tests exist for generate, jobStore, boardService, generationService, capabilities | `**/__tests__` |
| Config | No central config module; each file reads `process.env` directly | — |
| Deploy | `docs/deployment.md` sets **no `--timeout`** → Cloud Run default (300 s) applies, unless set in the console | `docs/deployment.md:43-66` |

### 4.2 Frontend (`frontend/src/`)
| Area | Current state | Path |
|---|---|---|
| API calls | All go through `/api/proxy/${path}` | `api/canvas.api.ts:12` |
| Board API | `getBoards()` / `getBoard()` exist but have **no callers** | `api/canvas.api.ts:24-34` |
| Proxy | In prod: mints the service-to-service OIDC token into `Authorization` and moves the user credential to `X-User-Identity`. **If minting fails, it carries on without the token.** Falls back to forwarding the `cookie` header as the user credential | `app/api/proxy/[...path]/route.ts` |
| Error handling | Reads `body.error === "token_expired"` (legacy string format) and `body.message` | `api/canvas.api.ts:16,51,63` |
| Canvas and nodes | **Entirely in the browser** (localStorage); frame images in **IndexedDB** | `app/canvas/board/canvasPersistence.ts`, `frameImageStorage.ts`, `store/nodePanel.store.ts`, `store/frame.store.ts` |
| Generation callers | `imageKind.tsx` → `generateImageV2`, `instructionKind.tsx` → `generateText`, `videoKind.tsx` → `startVideo` | `app/canvas/components/NodePanel/kinds/*` |
| Skills | localStorage (`gcos-skills`) via `localList`. Fields: `id, name, description, tags, fileName, size, content, createdAt`. **100 KB limit** (`MAX_SKILL_BYTES`). **No version or hash** | `store/skills.store.ts`, `lib/localList.ts`, `app/canvas/skills/skillFile.ts` |
| Agents | localStorage via `localList`. Fields include `instructions, model, skillIds[]` (**IDs, not versions**) | `store/agents.store.ts` |
| Brand | **In memory only** — lost on reload. Art direction includes a **`campaignContext`** component | `store/brand.store.ts` |
| Skills/Agents/Brand usage | Used **only on their library pages**. **Not selectable in the Create Image node, and never sent to any generation call** | `components/{Skills,Agents,Brand}/*` |
| Settings, sidebar, panels | localStorage | `store/settings.store.ts`, `store/sidebar.store.ts` |

### 4.3 What this means
The Node doc assumes the server already stores **boards, nodes, Skills, assets and sessions** and can check ownership of them.
**Today none of those exist on the server.** The browser is the source of truth, and the backend mostly forwards calls to models.
So most issues after NJS-04 are **"build server-side data storage first"** issues, not just integration work.

---

## 5. Cross-cutting clashes and risks

| # | Clash / risk | Where | My view |
|---|---|---|---|
| X1 | **Zod.** NJS-02 says "TypeScript/Zod"; `CLAUDE.md` says "No Zod". | NJS-02 | Resolved (D1): hand-written validation. |
| X2 | **400 vs 422.** The docs suggest 422; the repo returns 400 everywhere. | NJS-02/04 | Resolved (D2). |
| X3 | **"Session" means two things.** `routes/session.ts` is the *sign-in* session; the docs mean a *generation* session. | NJS-05, contract | Call the new one `generation_session_id`, with routes under `/api/generation-sessions`. In the contract, keep the field `session_id` but document it as "generation session". |
| X4 | **Where mutable state lives.** BigQuery isn't transactional (both docs say so), and Firestore is being removed. Generation sessions (open/closed), Skill version records, Agents/Brand CRUD and board state all need a store with **read-after-write and concurrency control**. | NJS-05/07/09/11/14 | **This is the largest undecided architecture question.** Options: (a) GCS JSON objects with generation-match preconditions, (b) Cloud SQL / AlloyDB, (c) keep Firestore for mutable state only. See SH-02. NJS-05 onward can't be finalized without it. |
| X5 | **Images are data URLs.** The format expects `gcs_uri` inputs and outputs. | NJS-06/13, PY-05/11 | Same problem the parked GCS image-storage plan targets. Merge that plan into NJS-06/13 and don't run a second epic. Its "metadata in Firestore" step must change to whatever SH-02 decides. |
| X6 | **Skills/Agents/Brand never reach generation today.** NJS-08/10 assume a "selected Skills" field in the prompt node config, but no such UI exists. | NJS-08/10 | Needs a **new UI issue** (NEW-02: Skill picker in the Create Image node) with Luma screen IDs and UI states. |
| X7 | **The model choice is missing from the request format.** The Create Image panel sends `modelId`, `quality`, `thinking`, `temperature` and `grounding`. The v1 request only has `prompt` and `output{aspect_ratio,count}`. | NJS-02/10, PY-10 | Product decision needed: does the model picker (IMG-01) still apply when personalization is on? I'd add an optional `model{id, image_size, thinking, temperature, grounding}` block in a v1 minor update **before NJS-10**, or the flag path would silently ignore the user's model choice. |
| X8 | **`count` vs variants.** The repo makes N calls for N variants. PY-10 says the model is called once per intended attempt. | NJS-11, PY-10/12 | Define it: `count = N` means **N attempts** within **one request**? Or N outputs from one attempt? This matters for BigQuery counts and billing. I'd go with one request, N attempts. |
| X9 | **Aspect ratios are treated differently.** The existing route silently turns an unknown ratio into `1:1`; D16 says to reject before forwarding. | NJS-02/04 | Reject with **400 on the new endpoint only**, and **leave the old route unchanged** (no changes to existing routes). Write the difference down in `inventory.md`. |
| X10 | **Sharing the constants needs a small refactor.** `VALID_ASPECT_RATIOS_V2` and `MAX_VARIANTS` aren't exported from `routes/generate.ts`. | NJS-02 | Move them to a shared module (e.g. `backend/src/common/generationLimits.ts`) and import them in both routes. Behaviour stays the same, but `generate.ts` changes, so the PR must say so. |
| X11 | **Timeout budget.** The deploy docs set no Cloud Run `--timeout` (so 300 s default), and image generation has taken around 138 s. | NJS-03 | Recommend `PYTHON_CLIENT_TIMEOUT_MS=240000` with Cloud Run at 300 s, **after checking the timeout actually deployed**. Add `--timeout` to `docs/deployment.md` so it's explicit. |
| X12 | **Brand includes `campaignContext`**, but the docs say no Campaign. | NJS-09, PY-04/09 | Keep it as a free-text art direction field. Don't link it to any campaign entity or ID. Confirm with the Python team that it's just prompt context. |
| X13 | **Agents reference Skills by ID, not version.** | NJS-08/09 | When an Agent is saved, store the Skill **version** it uses, or define "an Agent always uses the latest Skill version". I'd pin versions, since that matches "immutable versions" in the Shared Plan. |
| X14 | **The proxy hides failures.** If minting the OIDC token fails, it carries on without auth. It also forwards a raw `cookie` header as `X-User-Identity`, which `requireIdentity` won't accept because it expects `Bearer `. | NJS-01 (record), separate fix | Record both in `inventory.md`. Fix them separately, not inside the integration chain. |
| X15 | **Two error formats.** The new nested error object sits alongside legacy `{error,message}`. | NJS-04/10 | Resolved (D14). NJS-10 must read both formats. |
| X16 | **CI is off.** | All | Run tests and type checks locally and paste the results into the PR (as the agreed completion expectations require). |
| X17 | **Video.** The team's phase plan defers all video work to phase 101. | Scope | Every issue here is image-only. `/generate/video` and the `jobStore` video flow stay unchanged. |

---

## 6. Backlog overview

| ID | Title | Team | Readiness | Depends on | Milestone |
|---|---|---|---|---|---|
| NJS-01 | Code inventory & ownership map | Node | 🟢 | — | M1 |
| NJS-02 | Shared JSON request/response format v1 (types, validation, examples) | Node | 🟡 (4 questions) | NJS-01, SH-01 | M1 |
| NJS-03 | Python client: fake + real, OIDC, timeouts | Node | 🟡 (2 questions) | NJS-02 | M1 |
| NJS-04 | Minimal `POST /api/personalization/execute` | Node | 🟡 (2 questions) | NJS-03 | M1 |
| NJS-04A | Stable user identity (`sub`) | Node | 🟢 | — (before NJS-05) | M2 |
| NJS-05 | Generation sessions | Node | 🔴 (SH-02) | NJS-04, NJS-04A, SH-02 | M3 |
| NJS-06 | Resolve canvas assets to GCS IDs | Node | 🔴 (NEW-01, SH-03) | NJS-04, NEW-01 | M3 |
| NJS-07 | Server-side versioned Markdown Skills | Node | 🔴 (SH-02, SH-03) | NJS-04A, SH-02 | M3 |
| NJS-08 | Pass selected Skills to Python with trust checks | Node | 🔴 (NEW-02) | NJS-07, NJS-03, NEW-02 | M4 |
| NJS-09 | Store Agents & Brand on the server | Node | 🟡 | NJS-07, SH-02 | M5 |
| NJS-10 | Create Image panel behind flag | Node | 🟡 (X7) | NJS-04, NJS-06, NJS-08 | M4 |
| NJS-11 | Request vs attempt counters | Node | 🟡 (X8, SH-04) | NJS-05, SH-04 | M5 |
| NJS-12 | Job status & error propagation | Node | 🟡 | NJS-03, NJS-11 | M5 |
| NJS-13 | Output catalog + signed-URL preview | Node | 🔴 (NEW-01) | NJS-06, NJS-10 | M4 |
| NJS-14 | Remove Firestore from runtime | Node | 🟡 (SH-02) | NJS-01, SH-02 | M6 |
| NJS-15 | Full contract & E2E handoff gate | Node | 🔴 (all) | NJS-01..14, PY-15 | M6 |
| NEW-01 | Server-side image asset storage (GCS write + catalog) | Node | 🟡 | SH-02, SH-03 | M3 |
| NEW-02 | Skill picker in the Create Image node (UI) | Node (FE) | 🟡 (design) | NJS-07 | M4 |
| NEW-03 | Proxy: refuse when infra token can't be minted; fix cookie forwarding | Node | 🟡 | NJS-01 | any |
| NEW-04 | Make the Cloud Run timeout explicit in the deployment doc | Node/infra | 🟢 | — | M1 |
| NEW-05 | Persist Brand at all (it's in memory today) | Node (FE) | 🟡 | NJS-09 | M5 |
| SH-01 | Create the `gcos-api-contracts` repo and pin a version | Both | 🟡 | — | M1–M2 |
| SH-02 | Decide where changing state is stored (sessions, Skills, Agents/Brand, boards) | Both + infra | 🟡 **critical** | — | before M3 |
| SH-03 | GCS bucket/prefix layout, IAM, signed-URL policy | Both + infra | 🟡 | — | before M3 |
| SH-04 | BigQuery schema and the single writer for each table | Both | 🟡 | SH-02 | before M5 |
| SH-05 | Async job design (Cloud Tasks + status store) for production | Both | 🟡 | SH-02 | M6+ |
| PY-01..15 | FastAPI backlog | Python | see §9 | — | M1–M6 |

---

## 7. Node.js / Frontend issues (this repo)

### NJS-01 — Code inventory and ownership map
- **Source:** Node doc NJS-01; D6.
- **Readiness:** 🟢 Ready.
- **Objective:** a written map of the current code, so later issues extend what exists instead of guessing.
- **Repo check:** the paths suggested in the doc mostly exist. Corrections:
  - Skills/Agents persistence also lives in `frontend/src/lib/localList.ts`.
  - Canvas state is in `app/canvas/board/canvasPersistence.ts`.
  - Frame images are in `app/canvas/board/frameImageStorage.ts` (IndexedDB).
  - There are no `routes/skills.ts`, `routes/agents.ts`, `routes/brands.ts` or `services/nodeExecutionService.ts`. Those are new files in later issues.
- **Scope:** documentation only.
- **Out of scope:** any runtime change, refactors, deleting Firestore.
- **Tasks:** create `docs/integration/inventory.md` with one section per item:
  1. Express routes and middleware (with order and sign-in requirements)
  2. Sign-in and session-token handling, including anonymous/IAP modes and the email domain allow-list
  3. Existing image, text and video generation (models, parameters, variant fan-out, mock mode)
  4. Canvas and nodes stored in the browser (node kinds, upstream references, data URLs)
  5. Every localStorage and IndexedDB key and who reads/writes it
  6. In-memory board storage and the unused frontend board API
  7. Firestore references and their callers (expected: health probe + dependency + deployment doc)
  8. Skills, Agents and Brand storage (Brand is in memory only)
  9. Current asset handling (stubs; no GCS writes)
  10. All API endpoints, plus unused frontend API methods
  11. Proposed integration points for each NJS issue
  12. Node ↔ Python ownership table
  13. **Known gaps found during the review:** X9 aspect-ratio fallback, X14 proxy behaviour, no Cloud Run timeout set, no config module
- **Acceptance criteria:**
  1. Every component named in the inventory has a real repo path that exists at the PR's base commit.
  2. Every localStorage/IndexedDB key used in `frontend/src` (excluding tests) is listed with its owner.
  3. Every Firestore reference in `backend/src` is listed with a migration note.
  4. `git diff --name-only` shows only `docs/integration/inventory.md`.
  5. Backend `npm test` and both `tsc --noEmit` runs pass unchanged, with output recorded in the PR.
- **Template fields:** Screen IDs: N/A — documentation. UI states: N/A.
- **Dependencies:** none. **PR:** standalone.
- **Questions & my view:**
  - *Should this file (`gcos-integration-issues.md`) and `inventory.md` sit side by side in `docs/integration/`?* Yes. This file is the backlog; the inventory is the code baseline.

---

### NJS-02 — Shared JSON request/response format v1
- **Source:** Node doc NJS-02; D1, D2, D4, D5, D10–D14, D16.
- **Readiness:** 🟡 four small questions (below).
- **Objective:** one typed, validated, versioned definition of the Node ↔ Python messages, plus example files both teams test against.
- **Repo check:**
  - The validation helpers to follow are in `backend/src/common/validation.ts` (`isNonEmptyString`, `isOneOf`).
  - No `schemas/` or `contracts/` folder exists yet.
  - The constants to reuse are private to `routes/generate.ts` (X10).
- **Scope:**
  - TypeScript types for the public (browser → Node, camelCase) request and the Python (Node → Python, snake_case) request, success response and error response
  - hand-written validators
  - camelCase ↔ snake_case conversion
  - example files
  - compatibility notes
  - moving the two generation limit constants to a shared module
- **Out of scope:** HTTP client, route, sessions, assets, Skills resolution, `idempotency_key` (documented only).
- **Tasks:**
  1. `docs/contracts/generation/v1/` containing:
     - `README.md`: field tables, required/optional/nullable, compatibility rules, owner
     - `request.example.json`
     - `response.success.json`
     - `response.mock.json`
     - `invalid/*.json`: missing `node_id`, unknown `operation`, empty `prompt`, bad `aspect_ratio`, `count` 0 and 11, non-empty `inputs`, non-empty `skills`, wrong `schema_version`
     - `error.validation.json`
     - `error.upstream_unavailable.json`
     - `error.timeout.json`
  2. `backend/src/schemas/personalization.ts`: types and validators (file name from the doc; or `contracts/` to match the folder name, see Q2).
  3. `backend/src/common/generationLimits.ts`: export `VALID_ASPECT_RATIOS_V2` and `MAX_VARIANTS`, and import them in `routes/generate.ts` (no behaviour change).
  4. Tests that load **every** example file from `docs/contracts/generation/v1/` and check valid → accepted, invalid → rejected with the expected error code.
- **Request format v1 (Node → Python):**
  ```json
  {
    "schema_version": "1",
    "request_id": "req_…",            // always generated by Node (D13)
    "session_id": null,               // generation session; nullable in v1
    "board_id": null,                 // optional, nullable (D4)
    "node_id": "node_001",            // required for canvas execution
    "operation": "create_image",      // only value in M1 (D11)
    "prompt": "Create a premium product photograph",
    "inputs": [],                     // must be empty in M1
    "skills": [],                     // must be empty in M1
    "output": { "aspect_ratio": "1:1", "count": 1 }
  }
  ```
- **Success response v1:** as D10. **Error v1:** as D14.
- **Acceptance criteria:**
  1. Every file under `valid/` (or `*.example.json`) passes the validator, and every file under `invalid/` fails with the documented `error.code`.
  2. An unknown `operation`, a missing `node_id`, or a `schema_version` other than `"1"` is rejected.
  3. `aspect_ratio` outside `VALID_ASPECT_RATIOS_V2` and `count` outside 1…`MAX_VARIANTS` are rejected (not coerced).
  4. A camelCase → snake_case → camelCase round trip of the example request is lossless.
  5. `routes/generate.ts` behaves the same: existing generate tests pass unchanged.
  6. No Zod or other new dependency in `backend/package.json`.
  7. The README marks the format **DRAFT** until the Python team signs off. Approval is recorded in the PR.
- **Template fields:** N/A — backend only.
- **Dependencies:** NJS-01 (soft), SH-01 (who owns the format). **PR:** `[integration 1/3]`.
- **Questions & my view:**
  - **Q2-1 Mock `outputs`: `[]` or a fake `gs://` reference?** You preferred `[]`. My concern: the Shared Plan's exit criteria say "no phantom successes", and a `status: "completed"` with zero outputs looks like one.
    - **My view:** keep **one** clearly fake output, `gs://mock-gcos-output/…` with `asset_id` starting `mock_`. Make the rule that **NJS-13 only accepts outputs whose `gcs_uri` starts with the configured output prefix**, so fake references are rejected automatically rather than by convention. Then `completed` always means at least one output.
    - If you still prefer `[]`, then mock responses should use `status: "completed"` with `outputs: []` **plus** a documented rule that the fake is for format testing only.
  - **Q2-2 What happens if the browser sends `request_id`?** Choose **ignore** (consistent with existing routes, which ignore unknown fields) or **reject (400)**. I'd **ignore** it and log a warning. Rejecting would break any future client that sends a correlation ID.
  - **Q2-3 Does the browser send `schema_version`?** I'd say **no**. The public endpoint's version lives in its path or behaviour; Node.js adds `schema_version` when calling Python. "Unsupported major version" then only applies to Node ↔ Python and to responses.
  - **Q2-4 File location:** the doc suggests `backend/src/schemas/personalization.ts`. Fine, but name it `backend/src/contracts/generationV1.ts` if you'd rather the name match the version folder. Low stakes; pick one.
  - **Q2-5 (from X7):** should an optional `model` block be added before NJS-10? It isn't needed for M1, but decide before NJS-10.

---

### NJS-03 — Python client (fake + real)
- **Source:** Node doc NJS-03; D7, D8, D13, D16.
- **Readiness:** 🟡 two questions.
- **Objective:** let Node.js build and test the full flow without Python running, and switch to the real service by configuration only.
- **Repo check:**
  - `google-auth-library` is already a dependency, and the frontend proxy shows the `GoogleAuth().getIdTokenClient(url)` pattern.
  - There's no config module: read `process.env` directly, as other files do.
  - The production check exists as `NODE_ENV === "production" || !!K_SERVICE` (in `requireIdentity.ts` and `server.ts`).
- **Scope:** `backend/src/clients/pythonClient.ts` (interface + real), `backend/src/clients/mockPythonClient.ts`, client selection, error mapping, timeout, OIDC token.
- **Out of scope:** route, retries, async jobs, GCS, BigQuery.
- **Tasks:**
  1. `PersonalizationClient` interface: `execute(req): Promise<Result>`, where the result is either success or an error in the agreed format.
  2. Fake client: returns `response.mock.json` with `request_id`/`node_id` echoed back. Never touches the network.
  3. Real client:
     - `fetch` to `${PYTHON_SERVICE_URL}/v1/generation/execute` with an `AbortController` timeout of `PYTHON_CLIENT_TIMEOUT_MS`
     - sends `X-Request-Id`
     - in production, adds `Authorization: Bearer <OIDC>` with the audience set to the service URL
  4. Error mapping:

     | Python returns | Node returns |
     |---|---|
     | 400/422 | 400 `validation_error` |
     | 401/403 | 502 `upstream_auth_failed` (not retryable) |
     | 429 | 429 `rate_limited` (retryable) |
     | 5xx / network error | 503 `upstream_unavailable` (retryable) |
     | timeout | 504 `upstream_timeout` (retryable) |
     | invalid JSON / failed format check | 502 `upstream_invalid_response` |

  5. `selectClient()` implements the D8 table. **No fallback to the fake once a URL is set.**
  6. Never forwards the user's token or cookies to Python.
- **Environment variables:** `PERSONALIZATION_PYTHON_ENABLED=false`, `PYTHON_SERVICE_URL=`, `PYTHON_CLIENT_TIMEOUT_MS=` (proposed). Add them to `backend/.env.example` and `docs/deployment.md`.
- **Acceptance criteria:**
  1. The fake and real clients return objects that pass the same NJS-02 response validator.
  2. Tests cover: success; Python 422 → 400; 503 → 503 retryable; timeout → 504 retryable; malformed JSON → 502.
  3. With the flag on, production, and no URL: `selectClient()` gives an "unavailable" result (→ 503), and the server **still starts**.
  4. With a URL configured and the real service failing, the **fake is never used** (tested).
  5. In production mode the OIDC header is added (tested with a mocked `GoogleAuth`). In local mode it isn't.
  6. A timeout makes exactly **one** upstream call (no retry).
  7. No user credentials appear in the outgoing request (tested).
- **Template fields:** N/A — backend only.
- **Dependencies:** NJS-02. **PR:** `[integration 2/3]`.
- **Questions & my view:**
  - **Q3-1 Timeout value.** Needs the Cloud Run timeout actually deployed for `gcos-backend`; `docs/deployment.md` doesn't set one. My view: default to **240000 ms** if Cloud Run is at 300 s, and add `--timeout=300` to the deploy doc (NEW-04). Also check the **frontend** Cloud Run timeout: the proxy holds the request open too.
  - **Q3-2 Should the fake client be allowed when anonymous?** D15 says anonymous local is allowed only for fake testing. Should `selectClient()` **refuse the real client when the caller is anonymous**, even locally? My view: **yes**. It's a one-line guard, and it stops anonymous dev traffic from reaching a real, paid service.

---

### NJS-04 — Minimal personalization endpoint
- **Source:** Node doc NJS-04 (narrowed); D4, D8, D11, D13–D16.
- **Readiness:** 🟡 two questions.
- **Objective:** a secure, feature-flagged, prompt-only path from browser to Node.js to the fake (or real) Python client.
- **Repo check:**
  - Routers are mounted under `/api` in `server.ts`.
  - `requireIdentity()` is applied per route.
  - In anonymous mode `req.identity.email === "anonymous"`, and `getAuthMode()` exposes the mode.
- **Scope:** `backend/src/routes/personalization.ts`, registration in `server.ts`, request validation, request ID generation, calling the client, the response.
- **Out of scope:** frontend, sessions, assets, Skills, ownership checks, retries, `202`/jobs, BigQuery.
- **Public request (browser → Node, camelCase):**
  ```json
  {
    "prompt": "Create a premium product photograph",
    "nodeId": "node_001",
    "operation": "create_image",
    "inputs": [],
    "skills": [],
    "output": { "aspectRatio": "1:1", "count": 1 }
  }
  ```
- **Order of checks:**
  1. Feature flag (off → 404)
  2. `requireIdentity()` (legacy error format)
  3. Refuse anonymous in production (403, new format)
  4. Validate (400, new format)
  5. Generate `request_id`
  6. Choose the client (no URL in production → 503)
  7. Call the client
  8. Return the result
- **Acceptance criteria:**
  1. Flag off → 404 for both signed-in and signed-out callers. The response body looks the same as an unknown route.
  2. No credentials → 401 in the **legacy** format (`{ error: "token_missing", … }`), so the proxy's `token_expired` handling keeps working.
  3. Deployed + anonymous mode (`AUTH_MODE=anonymous`, `IAP_PROTECTED=true`) → rejected. Local anonymous + fake client → allowed.
  4. Non-empty `inputs` or `skills`, any `gcs_uri`/`gs://` value, or any inline/base64 image field → 400 `validation_error`.
  5. Unknown `operation`, bad `aspectRatio`, or `count` outside 1–10 → 400.
  6. Every response, including errors, carries a server-generated `request_id`. A `request_id` from the browser is not used (Q2-2).
  7. Success returns the D10 shape (converted to camelCase for the browser, see Q4-1).
  8. Fake upstream errors map to 400/503/504 with the right `retryable` value.
  9. Two different mocked users can't see each other's `request_id` logs or results. Tested with real-format tokens, not the anonymous user.
  10. `routes/generate.ts` behaviour and tests are unchanged.
  11. The Python service URL never appears in any response body or header.
- **Template fields:** N/A — backend only (no frontend change, D18).
- **Dependencies:** NJS-03. **PR:** `[integration 3/3]`.
- **Questions & my view:**
  - **Q4-1 Field naming in the browser response.** Should the browser get the D10 response in **camelCase** (`requestId`, `enhancedPrompt`) or as-is (snake_case)? My view: **camelCase**. Snake_case stays at the Python boundary only (agreed in NJS-02), and the frontend code is camelCase.
  - **Q4-2 What exactly does a 404 look like?** I'd not register the route when the flag is off at startup, so Express's default 404 applies. But D8 implies the flag might change at runtime. **Is the flag read once at startup or per request?** On Cloud Run, changing an env var creates a new revision anyway, so per-request reading gains nothing in production. Its value is in tests, which can flip the flag between cases without rebuilding the app. My view: **read it per request inside the handler**. It costs nothing and keeps tests simple. Either way, the body must not reveal that the endpoint exists.

---

### NJS-04A — Stable user identity (`sub`)
- **Source:** D3, D9 (proposed in review).
- **Readiness:** 🟢 Ready (independent of M1).
- **Objective:** key every future server-stored record on a stable provider ID rather than an email, which can change.
- **Repo check:**
  - `requireIdentity` sets `req.identity = { email }` only.
  - The Google ID token payload has `sub`.
  - The session JWT holds `{ email }` only (`lib/sessionToken.ts:28-54`).
  - `req.identity.email` has 8 readers. Boards and jobs store `userId = email`.
- **Scope:** add `sub` to `req.identity`, the session token and all owner fields. Old tokens keep working.
- **Out of scope:** tenants, roles, renaming display email.
- **Tasks:**
  1. `req.identity = { sub, email }`.
  2. Session token payload `{ sub, email }`. Verifying an **old** `{ email }`-only token is either (a) accepted with `sub` looked up lazily, or (b) treated as expired. See Q.
  3. Anonymous mode: `sub = "anonymous"`.
  4. Switch `boardStore`/`jobStore` owner checks to `sub`. Both are in memory, so no data migration is needed.
  5. Record every email-based consumer in `inventory.md`.
- **Acceptance criteria:**
  1. Google-token and session-token sign-ins both produce `req.identity.sub`.
  2. Old-format session tokens behave as decided in the Q below, and this is tested.
  3. Two users with different `sub` values can't read each other's boards or jobs (tests).
  4. The email domain allow-list still works.
  5. No frontend change is needed, or the needed one is listed.
- **Template fields:** N/A — backend only.
- **Dependencies:** none. **Must land before NJS-05.** **PR:** standalone.
- **Questions & my view:**
  - **Old session tokens:** accept-and-upgrade, or force a sign-in? My view: **treat old tokens as expired**. Users sign in again once, and the code stays simple. Sessions last 30 days, so it's a one-time cost. Announce it.
  - **Where `sub` comes from for session-token sign-ins:** it's signed into the JWT when the token is minted, so no lookup is needed.

---

### NJS-05 — Generation sessions
- **Source:** Node doc NJS-05.
- **Readiness:** 🔴 blocked by SH-02 (where changing state lives) and NJS-04A.
- **Objective:** a generation session that groups requests for one user and board, separate from sign-in.
- **Repo check:**
  - `routes/session.ts` is already the *sign-in* session (X3).
  - No storage interface exists beyond the in-memory board store.
  - Boards aren't persisted server-side, so "scoped to board" can only use a board ID the browser supplies, which D4 says isn't proof of access.
- **Scope:** create/resume/close APIs (`/api/generation-sessions`); a storage interface with an in-memory version; closed sessions reject new requests.
- **Out of scope:** BigQuery writes (NJS-11), board persistence.
- **Acceptance criteria (refined from the doc):**
  1. Create → resume returns the same `generationSessionId` across multiple Create clicks.
  2. A session owned by user A → user B gets 403 (or 404, see Q).
  3. A closed session refuses `execute` with a documented error code.
  4. NJS-04's `session_id` changes from null to a server-issued ID. The browser never makes one up.
  5. The storage interface has an in-memory version for tests and local dev.
- **Template fields:** N/A — backend only, unless a "session" indicator is shown in the UI (then BOARD-01).
- **Dependencies:** NJS-04, NJS-04A, SH-02.
- **Questions & my view:**
  - **Which store backs sessions in production?** (SH-02). BigQuery can't do "close" safely (no compare-and-swap). This is the blocking decision.
  - **When is a session created:** per board open, per node, or explicitly? My view: **one per board visit**, created lazily on the first `execute`.
  - **403 vs 404 for someone else's session:** I'd return **404**, so session IDs can't be probed.
  - **Board scoping while boards live in the browser:** store `boardId` only as an **unverified label** until boards are persisted server-side. Never use it for authorization.

---

### NJS-06 — Resolve canvas assets to GCS IDs
- **Source:** Node doc NJS-06.
- **Readiness:** 🔴 blocked by NEW-01 (assets aren't stored on the server) and SH-03.
- **Objective:** send Python **asset IDs / private `gs://` URIs** the server has authorized, never data URLs or browser-supplied URIs.
- **Repo check:**
  - Upstream node images and uploads are **data URLs held in the browser** (`capabilities/types.ts` `Reference`, `nodePanel.store.ts`).
  - `/api/assets` is a stub.
  - Nothing writes to GCS.
- **Scope:** `assetService` lookup from asset ID → `{ gcs_uri, mime_type, role }` with checks on owner, MIME type, existence and size; rejecting browser `gs://` values.
- **Out of scope:** uploading or storing images (NEW-01), output handling (NJS-13).
- **Acceptance criteria:**
  1. An input that is disconnected or missing gives an actionable 400 naming the node.
  2. Someone else's asset → 404/403. An object that doesn't exist → 404 with a contract code.
  3. Only allow-listed MIME types (`image/png`, `image/jpeg`, `image/webp`, to confirm).
  4. No base64 round trip anywhere on this path.
  5. A `gs://` value sent by the browser → 400.
- **Template fields:** N/A backend. (The UI side lands in NJS-10.)
- **Dependencies:** NJS-04, NEW-01, SH-03.
- **Questions & my view:**
  - **Merge with the parked GCS image-storage plan?** Yes. That plan's steps 1–4 are NEW-01 + NJS-06 + NJS-13. Its "Firestore metadata" step must follow SH-02.
  - **Existing data-URL nodes:** migrate them when the board loads (upload on first use) or leave them as-is? My view: **upload on first use** when the node is wired into a personalization request. Simpler than a bulk migration.
  - **Reference roles:** the format has a `role` field. Which values (`subject`, `style`, `product`, `logo`, …)? The Python team must define them (PY-05).

---

### NJS-07 — Server-side versioned Markdown Skills
- **Source:** Node doc NJS-07.
- **Readiness:** 🔴 blocked by SH-02 (metadata store) and SH-03 (GCS layout).
- **Objective:** Skills survive across browsers and devices, and each saved version is fixed and identified by a content hash.
- **Repo check:**
  - Skills are in localStorage key `gcos-skills`, with fields `id, name, description, tags, fileName, size, content, createdAt`, and **no version or hash**.
  - The 100 KB limit exists (`MAX_SKILL_BYTES`). The upload UI exists (`UploadSkillDialog.tsx`, `SkillsPage.tsx`).
- **Scope:** `routes/skills.ts` CRUD; each version stored as a fixed `.md` file under `skills/{owner}/{skill_id}/{version}.md`; metadata `{id, version, sha256, name, description, tags, size, createdAt, owner}`; one-time import from localStorage with the user's consent; the store becomes a cache in front of the API.
- **Out of scope:** Skill selection in nodes (NEW-02), sending to Python (NJS-08), Agents.
- **Acceptance criteria:**
  1. A Skill uploaded in browser A is listed in browser B for the same user.
  2. Editing creates a new version; old versions stay retrievable and unchanged (same hash).
  3. More than 100 KB, a non-`.md` file, or a non-UTF-8 file → 400. The UI's existing error message still shows.
  4. Another user's Skill ID → 404.
  5. Import: on first load with localStorage Skills present, the user is asked; accepting imports all of them (each becomes v1); declining keeps them local; the import never runs twice.
  6. If the API is down, the Skills page shows an error state and doesn't silently fall back to localStorage-only saving.
- **Template fields:** **Screen IDs:** SKILL-01. **UI states:** list loading · list empty · list error · upload in progress · upload rejected (size/type) · import prompt · import success · import partial failure · offline/API error.
- **Dependencies:** NJS-04A, SH-02, SH-03.
- **Questions & my view:**
  - **Version numbering:** an integer that increases per Skill (`1, 2, 3`) or the content hash? My view: **integer for display + sha256 for integrity**, both in the request.
  - **Delete semantics:** hide the Skill but keep its versions (so past generations can still be traced)? My view: **soft delete**. Requests that pinned a version still resolve it for audit.
  - **Is the import prompt in scope, or a separate issue?** It has UI states of its own. I'd **split it out** if this issue gets large.

---

### NJS-08 — Pass selected Skills to Python with trust checks
- **Source:** Node doc NJS-08.
- **Readiness:** 🔴 blocked by NEW-02 (there's no way to select a Skill in a node today).
- **Objective:** turn the user's selected Skill IDs into authorized, pinned, hash-checked content in the Python request.
- **Repo check:** Skills aren't referenced by any node kind or generation call (§4.2).
- **Scope:** accept `skillIds[]` (or `{id, version}[]`) in the public request; look up authorized versions; read the `.md` from GCS; check the sha256; fill `skills[]` with `{skill_id, version, sha256, content, source, selection_mode: "manual"}`.
- **Out of scope:** automatic Skill selection (the `auto_select_skills` flag isn't in format v1, see Q).
- **Acceptance criteria:**
  1. 0, 1 and several Skills are each passed correctly (example files).
  2. A deleted or someone else's Skill → 400/404 before Python is called.
  3. A hash mismatch → 500 `integrity_error`, and Python isn't called.
  4. Any `content` sent by the browser is ignored or rejected. Only server-resolved content reaches Python.
  5. Total Skill payload stays within a documented limit (proposed: 5 Skills or 300 KB).
- **Template fields:** N/A backend.
- **Dependencies:** NJS-07, NJS-03, NEW-02.
- **Questions & my view:**
  - **`auto_select_skills`:** the Node doc mentions this flag, but the agreed request format v1 doesn't include it. Add it as optional in a minor update, or defer it? My view: **defer it**. Manual selection first, then automatic selection once PY-06 is stable.
  - **Selection by ID only, or ID + version?** My view: the UI sends an **ID**, and Node.js pins the **latest version at request time** and records it. Agents pin versions explicitly (X13).
  - **Limits:** the Python team should confirm the maximum number of Skills and total characters per request.

---

### NJS-09 — Store Agents and Brand on the server
- **Source:** Node doc NJS-09.
- **Readiness:** 🟡 depends on SH-02. Brand isn't even saved in the browser today (NEW-05).
- **Objective:** versioned, permission-checked storage for Agents and Brand, with the UI unchanged.
- **Repo check:**
  - Agents are in localStorage, with `skillIds[]` by ID only.
  - Brand is **in memory only** and includes art direction components such as `campaignContext`, each with a `disabled` flag, plus reference images (`src`, i.e. data URLs).
- **Scope:** `routes/agents.ts`, `routes/brands.ts` CRUD with versioning; stores become caches in front of the API.
- **Out of scope:** using Agents/Brand in generation (later issue), Campaign entities.
- **Acceptance criteria:**
  1. The Agents and Brand pages look and behave the same as before (manual check against the current UI).
  2. Values survive reload and a different device.
  3. Brand and Agent are optional: a basic Create Image request works without either.
  4. Brand reference images stay display-only until roles are defined (doc requirement).
  5. Someone else's Agent/Brand → 404.
- **Template fields:** **Screen IDs:** agents and brand pages (no Luma ID listed; see Q). **UI states:** loading · empty · saved · save error · offline.
- **Dependencies:** NJS-07, SH-02.
- **Questions & my view:**
  - **One Brand per user, or several?** Today it's a single in-memory object. The Shared Plan has a `brand_versions` table. My view: **one Brand per user for v1, versioned**.
  - **Brand reference images** are data URLs. They need NEW-01 storage before they can be saved on the server. Defer images to after NEW-01.
  - **`campaignContext`** (X12): keep it as text only.
  - **Screen IDs:** the Luma reference table in `CLAUDE.md` has no Agents/Brand ID. Add IDs to the reference, or mark the issue "N/A — existing page, no visual change"?
  - **Split into two issues** (Agents, Brand)? `CLAUDE.md` says one feature per issue. **I'd split them.**

---

### NJS-10 — Create Image panel behind the flag
- **Source:** Node doc NJS-10.
- **Readiness:** 🟡 blocked in practice by NJS-06/08 and the model-field question (X7).
- **Objective:** the existing Create action uses the personalization endpoint when the flag is on, with no redesign. The old path stays available for rollback.
- **Repo check:**
  - `imageKind.tsx:203-209` calls `generateImageV2` with `modelId`, `instruction`, settings and references, and gets back data URLs.
  - The client reads the legacy error format (`canvas.api.ts:51,63`).
  - No frontend feature-flag mechanism was found. The frontend needs a way to know the flag (see Q).
- **Scope:** `api/canvas.api.ts` new `executePersonalization()`; `imageKind.tsx` chooses the path; reads both error formats; output rendered via NJS-13.
- **Out of scope:** new UI controls (the Skill picker is NEW-02), redesign, text/video nodes.
- **Acceptance criteria:**
  1. Flag off: behaviour identical to today (regression check of the Create Image flow).
  2. Flag on, no Skills: generation works; loading, error and output states look the same as today.
  3. Flag on with Skills selected: the request carries the Skill IDs (network panel check).
  4. A structured error shows its `message`; a `retryable` error offers a retry action (or the existing one).
  5. Legacy auth errors (`token_expired`) still trigger the existing re-sign-in flow.
  6. Tested at 50/100/150% zoom; no console errors.
- **Template fields:** **Screen IDs:** IMG-02, IMG-03, OBJ-01 (and IMG-01 if the model picker is affected). **UI states:** idle · generating · success (1 and N outputs) · partial success · validation error · upstream unavailable · timeout · signed out/expired · flag off.
- **Dependencies:** NJS-04, NJS-06, NJS-08, NJS-13.
- **Questions & my view:**
  - **How does the frontend learn the flag?** Options: (a) `NEXT_PUBLIC_…` build-time variable, (b) a field on `/api/auth-config`, (c) try the endpoint and fall back on 404. My view: **(b)**. It's one place, it works at runtime, and the endpoint already exists without sign-in.
  - **The model picker (X7):** when the flag is on, is the selected model sent or ignored? This must be decided before this issue.
  - **References:** the personalization path needs asset IDs. Until NJS-06, should flag-on Create Image with references be blocked with a message, or use the old path? My view: **use the old path automatically when references exist, and log it**, and say so in the UI states list. That isn't a silent model switch, because it's the same model and path as today.

---

### NJS-11 — Request vs attempt counters
- **Source:** Node doc NJS-11.
- **Readiness:** 🟡 depends on X8 and SH-04.
- **Objective:** one user click = one request; every real model call = one attempt; record both without duplicates.
- **Repo check:** `jobStore` is in memory and video only; variants fan out as N calls (X8). There's no BigQuery client yet (`@google-cloud/bigquery` isn't a dependency).
- **Scope:** `generationRequestService.ts`; `idempotency_key` (planned in D12) becomes active; `attempt_no`, `retry_reason`, final status; append-only BigQuery events with dedupe IDs.
- **Acceptance criteria:**
  1. One click → one `request_id`; the same idempotency key twice → one request (the second returns the first's result or `409`).
  2. Three model tries → three attempts, one request.
  3. Retried events with the same event ID don't double-count usage.
  4. `count = N` is recorded as decided in X8.
- **Template fields:** N/A backend.
- **Dependencies:** NJS-05, SH-04, PY-12.
- **Questions & my view:**
  - **Who counts attempts?** Python makes the model calls, so Python knows the attempts. Node only knows requests. My view: **Python reports attempts in the response (PY-12); Node is the single writer to BigQuery** (Shared Plan: one authoritative writer per table).
  - **Idempotency window:** how long is a key remembered? Needs a store that supports a check-then-write (SH-02); BigQuery can't do it.
  - **Duplicate response:** `409` or the original result? My view: **return the original result** if it finished, and `409` with the `request_id` if it's still running.

---

### NJS-12 — Job status and error propagation
- **Source:** Node doc NJS-12.
- **Readiness:** 🟡.
- **Objective:** the canvas sees honest progress and final states. A failure never shows as completed.
- **Repo check:** `jobStore` already defines `pending|done|failed` for video, and the frontend polls `getJob`. The personalization flow is synchronous in M1.
- **Scope:** standard `pending|running|completed|failed`; mapping of known FastAPI errors to stable public codes; logging by request ID; design hook for `202 + job_id` (SH-05).
- **Acceptance criteria:**
  1. A timeout, rate limit or model failure each produce a distinct public code and the correct `retryable`.
  2. No path returns `completed` with an error or with zero real outputs.
  3. Logs for one request can be found by `request_id` across Node and Python.
- **Template fields:** N/A backend (the UI side is in NJS-10).
- **Dependencies:** NJS-03, NJS-11.
- **Questions & my view:**
  - **Reuse `jobStore` for personalization, or a new store?** The existing one is in memory and loses jobs on restart. Fine for M1 synchronous calls; production needs SH-05.
  - **Status names:** `jobStore` uses `done`, the new format uses `completed`. Settle on **`completed`** for new code and leave video alone (phase plan).

---

### NJS-13 — Output catalog and signed-URL preview
- **Source:** Node doc NJS-13.
- **Readiness:** 🔴 blocked by NEW-01 and SH-03.
- **Objective:** Python's `gs://` outputs become catalogued assets, displayed via short-lived signed URLs (or a proxy), never public.
- **Repo check:** outputs today are data URLs shown directly; there's no signing code. The parked GCS plan's decisions still stand: (1) the backend service account needs *Service Account Token Creator* on itself to sign URLs; (2) signed URLs bypass the (unlanded) IAP gate.
- **Scope:** check the output prefix; catalog record `{asset_id, gcs_uri, mime, request_id, attempt_id, width, height}`; signed URL endpoint; refresh when expired.
- **Acceptance criteria:**
  1. Outputs outside the configured `generations/` prefix are rejected. This also rejects the fake `gs://mock-gcos-output/` references (Q2-1).
  2. The image shows in the output node; the bucket isn't public.
  3. An expired URL gets refreshed automatically when the image is shown.
  4. Another user's asset ID can't be signed.
- **Template fields:** **Screen IDs:** OBJ-01, ASSET-01/02. **UI states:** loading preview · shown · URL expired → refreshed · failed to load · access denied.
- **Dependencies:** NJS-06, NJS-10, NEW-01, SH-03.
- **Questions & my view:**
  - **Signed URLs vs proxy streaming:** signed URLs perform better but bypass IAP. Needs an explicit team decision (carried over from the parked plan).
  - **Signed URL lifetime:** proposed 15 minutes.
  - **Deletion and undo:** deleting a node can't delete the object straight away, because undo can restore it. Use soft delete plus a lifecycle rule (carried over from the parked plan).

---

### NJS-14 — Remove Firestore from runtime
- **Source:** Node doc NJS-14.
- **Readiness:** 🟡. Removing it is small; replacing board storage depends on SH-02.
- **Objective:** no Firestore SDK, configuration or calls in runtime code.
- **Repo check:** the only runtime use is the `/api/health` probe (`server.ts`). `boardStore` has Firestore `TODO`s but runs in memory. Other references: `docs/deployment.md` (`FIRESTORE_PROJECT_ID`, the `gcloud firestore` setup section) and the `@google-cloud/firestore` dependency.
- **Scope:** remove the probe branch, `lib/firestore.ts`, the dependency, env vars and doc sections; the health check then probes GCS (and the SH-02 store).
- **Out of scope:** building server-side board persistence (a separate issue once SH-02 is decided).
- **Acceptance criteria:**
  1. `grep -ri firestore backend/src` returns nothing (except migration notes, if kept).
  2. The backend starts with no Firestore env vars; `/api/health` reports the actual store.
  3. The deploy docs no longer mention Firestore.
  4. All tests pass.
- **Template fields:** N/A backend.
- **Dependencies:** NJS-01, SH-02.
- **Questions & my view:**
  - **Do it early?** Since Firestore is barely used, this could happen **early (M2)** and wouldn't need to wait for the end. The doc's concern ("board state under concurrent saves") applies to a server-side board store that doesn't exist yet. My view: **remove it early**, and put the concurrency criterion into whichever future issue adds server-side boards.

---

### NJS-15 — Full contract and E2E handoff gate
- **Source:** Node doc NJS-15.
- **Readiness:** 🔴 depends on everything.
- **Objective:** turn on the real FastAPI path only after both sides pass the shared example files.
- **Scope:**
  - switch from the fake to the live Python service behind the flag
  - check trace IDs, Skill versions, GCS images, errors, session counts and applied rules
  - record format drift
  - document rollback
- **Acceptance criteria:**
  1. Node → Express → FastAPI → GCS → preview passes for: plain prompt; prompt + 1 Skill; prompt + reference image.
  2. Failure scenarios give the documented codes: no Skill, asset not accessible, FastAPI timeout, invalid request, Gemini error.
  3. Basic Create Image with the flag off is unchanged.
  4. Rollback (flag off) is tested.
- **Template fields:** **Screen IDs:** IMG-02/03, OBJ-01. **UI states:** all states from NJS-10/13.
- **Dependencies:** NJS-01..14, PY-15.
- **Questions & my view:**
  - **Where do E2E tests run while CI is off?** Locally with Playwright (`frontend/e2e/`) against both services. Record the results in `docs/integration/`.

---

## 8. New issues proposed by this review

### NEW-01 — Server-side image asset storage (GCS write + catalog)
- **Why:** NJS-06 and NJS-13 assume assets exist on the server; today they're data URLs in the browser. This is step 1–2 of the parked GCS image-storage plan.
- **Scope:** upload endpoint (browser → Node → GCS `originals/…`); catalog record; local disk/memory fallback when `GCS_BUCKET_NAME` is unset (mock-mode rule); returns `asset_id`.
- **Acceptance criteria:**
  1. Uploading a PNG/JPEG returns an `asset_id`, and the object is private.
  2. With no bucket configured, a local fallback works and the server doesn't crash.
  3. Size and MIME limits are enforced.
  4. The owner is recorded as `sub` (NJS-04A).
- **Depends on:** NJS-04A, SH-02, SH-03.
- **Question:** should existing Create Image (non-flag) outputs also be stored here? That would fix the localStorage size limit sooner. My view: **yes, but in a follow-up issue**, so the integration chain doesn't grow.

### NEW-02 — Skill picker in the Create Image node (UI)
- **Why:** NJS-08/10 need a way to select Skills in a node, and none exists (X6).
- **Scope:** a control in the Create Image panel to choose saved Skills; stored in the node config as Skill IDs; shown in the node summary.
- **Template fields:** **Screen IDs:** IMG-02, IMG-03, SKILL-01. **UI states:** no Skills saved (empty + link to the Skills page) · list · selected (1 / many) · Skill deleted since selection · loading · error.
- **Depends on:** NJS-07.
- **Question:** what does the Luma reference show for Skill selection inside the Create panel? A design check against `Luma_UI_UX_Screen.docx` is needed before this can be specced.

### NEW-03 — Proxy hardening
- **Why:** X14. In production the proxy carries on without the infra token, and forwards a raw `cookie` header as `X-User-Identity`.
- **Scope:** refuse with 503 when the token can't be minted; review whether forwarding the cookie as `X-User-Identity` is intended (the session cookie is already forwarded separately).
- **Question:** is forwarding the cookie deliberate (an auth design detail in `docs/specs/001-auth-design.md`)? This needs checking against the auth spec before anything changes.

### NEW-04 — Make the Cloud Run timeout explicit
- **Why:** X11. The timeout for the Python client depends on it.
- **Scope:** add `--timeout=` for backend and frontend to `docs/deployment.md`; record the values actually deployed.

### NEW-05 — Persist Brand (at all)
- **Why:** Brand is in memory only. NJS-09 is server persistence, but Brand doesn't even survive a reload today.
- **Question:** fold this into the Brand half of NJS-09, or ship localStorage persistence first as a quick fix? My view: **fold it into NJS-09 (Brand)**. Adding localStorage now just means migrating it again later.

---

## 9. Python / FastAPI issues (other team)

> Not checked against Python code (that repo isn't in this workspace). Each entry lists what matters
> **at the point where it meets Node.js**, and the questions this team should ask.

| ID | Title | Point of contact with Node | Questions & my view |
|---|---|---|---|
| PY-01 | Review the FastAPI pipeline and its Firestore coupling | None | Ask them to share their inventory so ours (NJS-01) can link to it. |
| PY-02 | Matching Pydantic request format and example files | **Must accept/reject exactly the NJS-02 example files** | Their Pydantic models must apply D11 (`create_image` only), D12 (`schema_version` check), and treat `request_id` as required. They may return 422 internally (D2). |
| PY-03 | Fake execution endpoint | Target for NJS-03's real client in Stage C | `GET /health` path and response shape? We need it for readiness checks. Should their fake return the same `response.mock.json`? Yes, ideally. |
| PY-04 | Reusable session context object (no campaign) | `session_id` is null in M1 | Confirm they handle `session_id: null` and `board_id: null`. |
| PY-05 | Load and verify reference images from GCS | `inputs[]` from NJS-06 | Need: allowed buckets/prefixes, the list of `role` values, max size and count. Their service account needs read access to `originals/` (SH-03). |
| PY-06 | Receive manual Skills with recorded provenance | `skills[]` from NJS-08 | Confirm max Skill count and size; that `content` is never treated as a system instruction; the format of the rejection reason in `applied_skills`. |
| PY-07 | Mandatory guardrails as a separate policy layer | `applied_guardrails[]` | What does a guardrail entry look like (`{id, version, outcome}`)? Needs defining in format v1 before PY-07 ships. |
| PY-08 | Understand vague prompts with one multimodal call | `enhanced_prompt` | Does "structured clarification" become a new `status` (e.g. `needs_clarification`)? That would be a format change and needs agreeing **before** they build it. |
| PY-09 | Build the prompt package (no Campaign) | Brand/Agent context (future) | Priority order: policy > edit scope > user Skills > style. Confirm Brand `campaignContext` is plain text (X12). |
| PY-10 | Map image operations to the existing engine | `operation`, `output.count` | **Which model** is used when Node sends none (X7)? How does `count > 1` map to attempts (X8)? |
| PY-11 | Store outputs, return durable GCS references | `outputs[]` | Must write under the agreed `generations/` prefix so NJS-13's prefix check passes. Should they include `checksum`/dimensions in v1? It's optional in D10. |
| PY-12 | Track attempt and usage metadata | Attempts and usage for NJS-11 | Return attempts **in the response** (Node writes to BigQuery) or emit events directly? The Shared Plan says one writer per table: decide in SH-04. |
| PY-13 | Secure service-to-service access | NJS-03 OIDC | Cloud Run IAM invoker set to the backend's service account. Confirm the audience is the Python service URL. **Gates production for D7.** |
| PY-14 | Remove Firestore and the campaign runtime path | None directly | Legacy routes stay behind a gate. |
| PY-15 | Publish the integration handoff and live smoke tests | **Gates NJS-15** | Their smoke tests should use the **same** example files (SH-01), not their own copies. |

---

## 10. Shared / cross-team issues

### SH-01 — Who owns the request/response format
- **Decision so far:** D5. `docs/contracts/generation/v1/` here until `gcos-api-contracts` exists.
- **Open:** who owns it? How is a version pinned (git tag, npm/pip package, git submodule)? My view: **git tags in the contracts repo**, with each service copying a tagged release into `contracts/` via a script. No submodules, which are fragile with Windows tooling.

### SH-02 — Where changing state is stored ⚠️ critical
- **Problem:** sessions (open/closed), idempotency keys, Skill/Agent/Brand metadata and future board state all need writes and concurrency control. BigQuery can't do that (both docs say so). Firestore is being removed.
- **Options:**
  - (a) **GCS JSON objects with `ifGenerationMatch`**: no new service, but awkward queries (listing and filtering).
  - (b) **Cloud SQL (Postgres)**: proper transactions and queries, at the cost of a new managed service.
  - (c) **Keep Firestore for mutable state only**: contradicts the "no Firestore" rule.
- **My view:** for v1, **(a) for Skills/Agents/Brand** (small, per-user, read-mostly) **and (b) for sessions and idempotency** once multi-instance production is needed. If a new database isn't acceptable, (a) everywhere, plus a single-instance limit for M1–M4.
- **This blocks NJS-05/07/09/11 and NEW-01.**

### SH-03 — GCS layout, IAM and signed URLs
- **Decide:**
  - bucket names per environment
  - the prefixes (Shared Plan §GCS, with `{tenant}` replaced by `{owner_sub}` since there's no tenant in v1)
  - lifecycle rules
  - which service account gets read/write on which prefix
  - *Token Creator* for signing
  - signed URLs vs IAP (from the parked plan)

### SH-04 — BigQuery schema and the single writer per table
- **Decide:** columns for the 9 tables; partitioning by UTC date; clustering by owner/session; **which service writes each table**; dedupe IDs; retention and deletion.
- **My view:** **Node.js is the only writer.** Python returns attempt and usage data in the response.

### SH-05 — Async jobs in production
- **Decide:** when to move from synchronous calls to `202 + job_id`; Cloud Tasks plus a status store (SH-02); polling vs push.
- **My view:** stay synchronous until image generation regularly approaches the timeout budget (X11).

---

## 11. Master list of open questions

Each question has a recommendation; the **Owner** column is who decides.

| # | Question | Issue | Recommendation | Owner |
|---|---|---|---|---|
| Q1 | Mock `outputs`: `[]` or a fake `gs://`? | NJS-02 | One fake output under `gs://mock-gcos-output/`, rejected by NJS-13's prefix check | Both teams |
| Q2 | Browser sends `request_id`: ignore or reject? | NJS-02/04 | Ignore and log a warning | Node |
| Q3 | Does the browser send `schema_version`? | NJS-02 | No; Node adds it for Python | Both |
| Q4 | Schema file location/name | NJS-02 | `backend/src/schemas/personalization.ts` (as the doc says) | Node |
| Q5 | Browser response field naming | NJS-04 | camelCase | Node |
| Q6 | Flag read at startup or per request? | NJS-04 | Per request | Node |
| Q7 | Python client timeout value | NJS-03 | 240 s if Cloud Run is 300 s; confirm what's deployed | Node + infra |
| Q8 | Refuse the real client for anonymous callers (even locally)? | NJS-03 | Yes | Node |
| Q9 | Old session tokens after adding `sub` | NJS-04A | Treat as expired, users sign in again once | Node |
| Q10 | Store for changing state | SH-02 | GCS JSON for libraries; Cloud SQL for sessions/idempotency later | Both + infra |
| Q11 | When a generation session is created | NJS-05 | Lazily, one per board visit | Node |
| Q12 | 403 or 404 for someone else's resources | NJS-05..09 | 404 | Node |
| Q13 | Model picker when the flag is on (model fields in the request) | NJS-02/10, PY-10 | Add an optional `model` block before NJS-10 | Product + both |
| Q14 | Meaning of `count = N` | NJS-11, PY-10/12 | One request, N attempts | Both |
| Q15 | `auto_select_skills` | NJS-08 | Defer | Both |
| Q16 | Skill version scheme | NJS-07 | Integer + sha256 | Node |
| Q17 | Agents pin Skill versions? | NJS-09 | Yes | Product |
| Q18 | Split NJS-09 into Agents and Brand | NJS-09 | Yes | Node |
| Q19 | Screen IDs for Agents/Brand pages | NJS-09 | Add to the Luma table or mark N/A | Design |
| Q20 | How the frontend learns the flag | NJS-10 | A field on `/api/auth-config` | Node |
| Q21 | Flag on + references before NJS-06 | NJS-10 | Use the old path automatically, logged | Product |
| Q22 | Signed URLs vs proxy (IAP bypass) | NJS-13, SH-03 | Signed URLs, explicitly approved | Both + security |
| Q23 | Remove Firestore early (M2) instead of last | NJS-14 | Yes | Node |
| Q24 | Guardrail entry shape in `applied_guardrails` | PY-07 | Define `{id, version, outcome}` in v1 | Python |
| Q25 | `needs_clarification` status | PY-08 | Agree before building; it's a format change | Both |
| Q26 | Who writes BigQuery | SH-04, PY-12 | Node only | Both |
| Q27 | Pinning the format version | SH-01 | Git tags + copy script | Both |
| Q28 | Is forwarding the cookie as `X-User-Identity` intended? | NEW-03 | Check against `docs/specs/001-auth-design.md` | Node |

---

## 12. Suggested milestones and order

| Milestone | Goal | Issues | Exit check |
|---|---|---|---|
| **M1** Fake end-to-end slice | Node → fake Python → structured response (D18) | NJS-01, NJS-02, NJS-03, NJS-04, NEW-04, SH-01 (interim) | supertest: flag table, auth, validation, mapping of errors, timeout |
| **M2** Foundations | Stable identity; Firestore gone; state store decided | NJS-04A, NJS-14 (early), SH-02, SH-03 decisions | Backend runs with no Firestore; `sub` everywhere |
| **M3** Server-side data | Assets, Skills, sessions on the server | NEW-01, NJS-06, NJS-07, NJS-05 | Skills persist across devices; assets have IDs |
| **M4** Product path | Create Image on personalization with Skills and preview | NEW-02, NJS-08, NJS-13, NJS-10 | Flag-on Create Image works on canvas; UI states verified at 50/100/150% |
| **M5** Accounting and context | Requests/attempts, job status, Agents/Brand | NJS-11, NJS-12, NJS-09 (split), NEW-05, SH-04 | Accurate counts; no phantom successes |
| **M6** Live integration | Real FastAPI, E2E, production hardening | NJS-15, PY-13/15, SH-05, NEW-03 | Exit criteria in the Shared Plan all pass; rollback tested |

**Critical path:** SH-02 (store for changing state) → NJS-05/07/NEW-01 → NJS-08/13 → NJS-10.
M1 can start **now**, because it doesn't depend on SH-02.

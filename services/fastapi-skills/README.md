# GCOS Personalization — FastAPI / Google Agent Registry control plane

> Lives in `services/fastapi-skills/` (moved from `docs/aryash/GCOS-FastAPI-skills-main`, #515). Every setting is in [`.env.example`](.env.example). The Node BFF calls it through `backend/src/lib/fastapi/` (`FASTAPI_BASE_URL`; PACK NJS-08, #494); `examples/node-bff-client.ts` is a minimal sketch of the same call.

**Status:** Reference implementation / integration starter, reviewed against Google Agent Registry `v1alpha` REST API documentation (9 Nov 2026). Run against a nonproduction governance project and confirm API compatibility, IAM, service accounts and scanning before promotion.

The *only* capabilities in this package are the three finalized direct/synchronous API areas:

1. **Skills CRUD and idempotent publish** — create a logical Registry Skill container, list/get by the user, update Registry display metadata, disable (safe delete), create immutable revisions, poll Registry long-running operations, and promote an active revision.
2. **Tool catalog validator** — validate tool names against GCOS's reviewed allowlist; this is a policy catalog check, not an MCP tool execution service.
3. **AI Skill creation helper** — Gemini generates an editable `SKILL.md` draft only; never auto-publishes or runs code.

This service does **not** implement Cloud Tasks, ADK execution, user login, GCS generation, BigQuery, or the DAM. Those are distinct services in the agreed architecture.

## Data ownership

- **Agent Registry**: authoritative Skill containers, immutable revisions and published content. `SKILL.md` zipped bytes are sent to the Registry API directly and **not stored in GCS or Firestore**.
- **Firestore**: `skill_ownership/{skillId}` (trusted ownerKey and Registry pointer, status), `skill_publish_requests/{operationHash}` (durable publish state, payload SHA and LRO pointer), and `skill_quotas/{ownerKey}` (atomic count and published/reserved raw bytes). No published content is duplicated.
- **Node BFF**: authenticates the browser session, resolves the immutable `ownerKey` and authorizes it. FastAPI receives **only a Google-signed service ID token** from Node plus `X-Owner-Key`. It never accepts the user's Google ID token and never trusts `X-Owner-Key` without verifying that the caller is exactly the allowlisted Node service account. Production Cloud Run must be **private** and grant `roles/run.invoker` only to the Node BFF workload identity.

`POST /v1/skills` creates a Registry container with `TARGET_STATE_DRAFT`; it does not publish executable content. Content publication is a **different** explicit endpoint. `DELETE` disables the container, preserving revisions referenced by historical runs; destructive purge is intentionally unavailable.

## Project layout

```text
app/
  main.py         FastAPI routes (Node-only)
  config.py       environment settings
  security.py     Node Cloud Run OIDC authentication + trusted ownerKey
  models.py       Pydantic request/response contracts
  store.py        transactional Firestore ownership and publish operation records
  registry.py     REST Agent Registry + google-auth ADC
  service.py      idempotent publish state machine
  packaging.py    validate SKILL.md + deterministic zip
  catalog.py      allowlist tool validator
  helper.py       Gemini-powered draft creator
  data/           (parent folder) allowlisted tool catalog
```

## Development setup

Requirements: Python 3.11+. The unit tests need nothing else: they use a fake Registry and an in-memory store, so they run with no Google Cloud project, credentials or `.env`. Running the service itself needs a Google Cloud project with Agent Registry enabled in the supported location, the Google Cloud CLI, the Vertex AI API for the helper, and Firestore in the correct project. Use a **test project first**.

macOS / Linux:

```bash
cd services/fastapi-skills
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pytest -q                      # no cloud needed
cp .env.example .env           # then fill it in: projects, audience, Node service account
gcloud auth application-default login
uvicorn app.main:app --reload --port 8080
```

Windows PowerShell:

```powershell
cd services\fastapi-skills
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pytest -q
Copy-Item .env.example .env
gcloud auth application-default login
uvicorn app.main:app --reload --port 8080
```

The service refuses to start without `GOOGLE_CLOUD_PROJECT` and `FIRESTORE_PROJECT_ID`, and without `FASTAPI_AUDIENCE` and `NODE_SERVICE_ACCOUNT` unless `DEV_BYPASS_AUTH` is on (`tests/test_startup.py`).

Local end-to-end testing against the **real** Registry can set `DEV_BYPASS_AUTH=true` in `.env` to bypass **only the Node service-ID-token check**. It requires `X-Owner-Key` and is **never** permitted on Cloud Run. Registry and Firestore still use ADC and real services. This is unsafe on an internet-accessible development machine; bind to localhost only.

## Configuration

| Key | Meaning |
| --- | --- |
| `GOOGLE_CLOUD_PROJECT` | Agent Registry governance project |
| `REGISTRY_LOCATION` | Registry resource location, such as `us` / `eu`; availability is project-specific |
| `REGISTRY_API_VERSION` | `v1alpha` (explicit Skills REST API reference); verify supported API version in your project |
| `REGISTRY_BASE_URL` | Agent Registry API root (default `https://agentregistry.googleapis.com`) |
| `FIRESTORE_PROJECT_ID` | Project for GCOS owner/publish operation records |
| `FASTAPI_AUDIENCE` | Exact private FastAPI Cloud Run service URL |
| `NODE_SERVICE_ACCOUNT` | Only allowed calling Node BFF service account email |
| `VERTEX_LOCATION` | Model helper location |
| `SKILL_HELPER_MODEL` | Enabled Gemini text model in your project |
| `SKILL_HELPER_MAX_OUTPUT_TOKENS` | Generation cap |
| `SKILL_HELPER_BACKEND` | `gemini` (default) or `fake`: deterministic answers with no model call, for local runs; refused on Cloud Run |
| `SKILL_HELPER_TIMEOUT_SECONDS` | The model call's limit (default 30); slower answers `503` |
| `SKILL_HELPER_DRAFTS_PER_HOUR` | Drafts per owner per hour (default 20), counted in `skill_quotas/{owner}`; more answers `429` |
| `SKILL_HELPER_MAX_PROMPT_CHARS` | The whole prompt's limit (default 8000), checked before any model call; over answers `422` |
| `DEV_BYPASS_AUTH` | **Local only**, never Cloud Run |

IAM (least privilege): Node service account needs `roles/run.invoker` on FastAPI. FastAPI runtime service account needs permission to read/write **its own** Firestore ownership/operation collections, `agentregistry.skills.create`, `agentregistry.skills.get/list/update`, and `agentregistry.skillRevisions.create/get`; for trial access, `roles/agentregistry.editor` includes broader Registry privileges. The helper additionally needs Vertex AI prediction permissions. Secure Cloud Run ingress and avoid service account keys.

## Endpoints

| Method | Route | Effect |
| --- | --- | --- |
| `POST` | `/v1/skills` | Reserve GCOS Skill ownership; create disabled/draft Registry container; retry is safe |
| `GET` | `/v1/skills` | List only the authenticated ownerKey's Skill pointers |
| `GET` | `/v1/skills/{skillId}` | Owner-authorized Registry metadata and status |
| `PATCH` | `/v1/skills/{skillId}` | Update Registry metadata via LRO; not SKILL.md content |
| `GET` | `/v1/skills/{skillId}/revisions` | List immutable revision metadata from Registry |
| `GET` | `/v1/skills/{skillId}/revisions/{revisionId}` | Read one revision metadata record |
| `GET` | `/v1/skills/{skillId}/revisions/{revisionId}/download` | Download authorized active revision ZIP from Registry |
| `DELETE` | `/v1/skills/{skillId}` | **Disable**, don't hard delete historical revisions |
| `POST` | `/v1/skills/{skillId}/publish` | ZIP SKILL.md, create immutable revision, validate/promote; `Idempotency-Key` required |
| `GET` | `/v1/skills/{skillId}/publish-operations/{opId}` | Poll & advance durable Registry LRO, return `published` only after active |
| `POST` | `/v1/tools/validate` | Check names against approved catalog; does not execute tools |
| `POST` | `/v1/skills/ai-draft` | Gemini generates an editable SKILL.md; **no publication**. Bounded per owner and in time (`429`, `503`); a model answer that isn't a SKILL.md is `502` |
| `GET` | `/healthz` | Liveness |

API docs locally: `http://127.0.0.1:8080/docs`. Production can restrict OpenAPI exposure at the gateway.

## Typical API request sequence

All requests originate at the BFF. The caller sends `Authorization: Bearer <OIDC_ID_TOKEN>` with audience equal to the FastAPI Cloud Run URL plus `X-Owner-Key: usr_...` derived *server-side*. The browser must **not** send either directly to FastAPI.

```http
POST /v1/skills
Content-Type: application/json
X-Owner-Key: usr_example
Authorization: Bearer <NODE_SERVICE_ID_TOKEN>

{"slug":"brand-tone","display_name":"Brand Tone","description":"Applies approved brand voice to generated copy"}
```

Registry creates a **private** Skill ID with a reserved deterministic prefix. Take `skillId` from the response (GCOS logical ID, not the user's display name).

```http
POST /v1/tools/validate
Content-Type: application/json
X-Owner-Key: usr_example
Authorization: Bearer <NODE_SERVICE_ID_TOKEN>

{"tool_names":["brand.read","image.generate"]}
```

Draft first (optional):

```http
POST /v1/skills/ai-draft
Content-Type: application/json
X-Owner-Key: usr_example
Authorization: Bearer <NODE_SERVICE_ID_TOKEN>

{"name":"brand-tone","goal":"Generate short, brand-compliant product copy for creative images.","constraints":["Never invent product claims"],"approved_tools":["brand.read"]}
```

Review and approve the returned Markdown. Only after the user's explicit action:

```http
POST /v1/skills/{skillId}/publish
Idempotency-Key: 6f0c4563-967d-45bd-b72d-cb510a5db4b4
Content-Type: application/json
X-Owner-Key: usr_example
Authorization: Bearer <NODE_SERVICE_ID_TOKEN>

{
  "markdown": "---\nname: brand-tone\ndescription: Applies brand voice to product copy.\nallowed-tools: [brand.read]\n---\n# Instructions\nRead approved rules and generate short, accurate copy.\n",
  "tool_names": ["brand.read"]
}
```

Response may be `202` with `pending`, `publishing` or `pending_activation`; continue polling the publish operation until status is `published`. The server never labels a pending Registry scan as published.

### Declaring tools in SKILL.md

A Skill declares the tools it uses in its front matter, as `allowed-tools`: a YAML list, or a comma/space-separated string, of names from the approved catalog (`data/tool_catalog.json`). No field means a tool-free Skill, which is valid.

```yaml
---
name: brand-tone
description: Applies brand voice to product copy.
allowed-tools: [brand.read, image.generate]
---
```

Publish checks the Markdown's own declaration, not only the `tool_names` sent with it (#509):

- a malformed declaration (not a list of names, a URL or path, a duplicate, an invalid name) is `422` with `{"tool_declaration_errors": [...]}`;
- a declared tool missing from `tool_names` is `422` with `{"tools_not_listed": [...]}`;
- `tool_names` is then checked against the catalog, as before (`{"invalid_tools": [...]}`).

The AI helper asks the model to declare tools the same way and checks its draft: a draft whose declared tools are malformed, unapproved or not among the request's `approved_tools` comes back with `valid: false` and one entry in `issues` per problem. It is never published or silently fixed.

### Why publish idempotency works

- Ownership and a publish operation are **reserved in Firestore transactionally before remote Registry writes**.
- The idempotency key is scoped by `(ownerKey, skillId)`; the operation has an immutable request hash. Same key/different content returns HTTP 409.
- The ZIP and revision ID are deterministic; Agent Registry `requestId` is also stable for retries. A retry reads existing Registry revisions/operations rather than creating another version.
- A per-skill `activePublishOp` admits only one pending publication; concurrent conflicting publications return 409. Transactional quotas enforce 5 Skills per owner, 100 KiB per SKILL.md and 300 KiB total approved published content (including in-flight reservations). The effective 30,000-character context budget is **enforced later by the ADK context resolver**, not this API.
- Registry ingestion/scanning and promotion use explicit LRO state. A generated draft or successfully created revision is **not** equivalent to active publication.
- A process crash after reservation leaves a resumable Firestore operation. If it crashed before the revision POST, the caller must retry the same **publish POST with the original Markdown**; a GET cannot reconstruct it because the system intentionally does not store ZIP content.
- Some error states require manual administrator reconciliation; do not arbitrarily clear an in-progress reservation and allow another publish.

### API boundaries / not yet implemented

This is an integration-ready **starter**, not a production-certified Skill control plane. Required before go-live:

1. Integration-test the `v1alpha` REST calls and `private-` resource names in the actual governance project. The publicly described REST `v1` skills registration examples may be newer than the `v1alpha` reference; pick one verified release, do not mix them.
2. Confirm `SkillRevision` scanning policy/activation state and errors under your organization policy, including failed scan and rollback.
3. Make the per-skill metadata PATCH operation and disable LRO fully resumable with revision CAS; current implementation returns the LRO name without a dedicated metadata-operation reconciler.
4. Add TTL/maintenance procedures for durable publish operations, retriable conflicts, and an operator-only recovery endpoint for failed/stuck Registry calls.
5. Validate that Registry already approves/restricts an MCP server's actual methods; catalog allowlisting is not a substitute for enforcement in the tool runtime. **Never allow agents to derive arbitrary tool names, URLs or owner keys.**
6. Limit AI-helper prompt rates, add budget counters per user/job, model output checks and a mandatory human publish review.
7. Add structured traces/logs and API quotas, alert on stuck operations; define error taxonomy for downstream Node.
8. Add service account IAM tests and explicit denial tests for cross-user read/list/publish/revocation, forged `X-Owner-Key`, replay, and direct browser access.
9. No unpublished draft content is persisted in Firestore; keep user-editable local drafts in the browser or an explicitly approved draft store.

## Official docs checked

- https://docs.cloud.google.com/agent-registry/register-skills
- https://docs.cloud.google.com/agent-registry/reference/rest/v1alpha/projects.locations.skills/create
- https://docs.cloud.google.com/agent-registry/reference/rest/v1alpha/projects.locations.skills.revisions/create
- https://docs.cloud.google.com/agent-registry/skills-architecture
- https://docs.cloud.google.com/run/docs/authenticating/service-to-service

See `examples/node-bff-client.ts` for a minimal Node BFF -> FastAPI service-ID-token integration example.

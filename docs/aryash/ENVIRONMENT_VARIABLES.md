# Environment Variables

## 1. Purpose

This document inventories environment variables used by the checked-out
application, its examples and deployment documentation. It distinguishes live
configuration from locally optional settings and from settings that would only
be needed if the planned FastAPI/ADK architecture is added.

Values from local `.env` files are deliberately not reproduced here. In
particular, the local backend environment contains a non-empty session secret.

## 2. Architecture Overview

The implementation in this checkout currently runs as:

```text
Browser
  -> Next.js frontend and same-origin /api/proxy
  -> Express/Node.js backend
  -> Vertex AI, Firestore, Cloud Storage, and optionally Cloud Tasks
```

The requested architecture documentation (`00_START_HERE.md`,
`01_FROZEN_ARCHITECTURE_RULES.md`, `02_SHARED_CONTRACTS.md`,
`03_IMPLEMENTATION_ORDER.md`, `Architecture_References/`, `FastAPI/`, and
`Node_BFF/`) and a Python FastAPI/ADK service are not present in this checkout.
There is no implemented Node-to-FastAPI or FastAPI-to-ADK hop to configure.
Consequently, no Python, FastAPI, ADK, agent-runtime, or workflow-runtime
environment variable is asserted as required below.

## 3. Environment Variable Classification

- **IMPLEMENTED** — read by the checked-out application or platform integration.
- **ARCHITECTURE REQUIRED** — required by documented deployment behavior, but
  not necessarily by a local run.
- **MISSING** — required for a stated deployment/use case but absent or empty
  in the inspected current environment.
- **PROPOSED** — a suggested name for an integration not implemented here.
- **OPTIONAL** — supported, but has a default or is needed only for a particular
  mode.
- **CONFIGURED BUT UNUSED** — present in an inspected env file but not read by
  the application.
- **DEPRECATED** — no variable is confirmed deprecated by the current code;
  `LOCAL_STORAGE_DIR` may be a stale/mistyped setting, but is not marked
  deprecated absent an owner decision.

Cloud Run supplies `K_SERVICE` and `PORT`; Node/Next tooling supplies
`NODE_ENV`; Vitest supplies `VITEST`. These are runtime/test indicators, not
values to copy into local env files.

## 4. Frontend Environment Variables

| Variable | Required | Secret | Local | Cloud | Default / Example | Status | Purpose | Source |
|---|---|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` | For Google sign-in | No | Optional for anonymous/dev auth | Yes for Google sign-in; set at frontend build time | OAuth web client ID | IMPLEMENTED; set in current `frontend/.env.local` | Google Identity Services client ID; deliberately browser-visible | `frontend/src/auth/googleIdentity.ts`; `frontend/.env.local.example`; `docs/deployment.md` |
| `BACKEND_URL` | Needed to target a non-default backend; effectively required in cloud | No | Optional; defaults to `http://localhost:4000` | Yes; internal backend Cloud Run URL | `http://localhost:4000` | IMPLEMENTED; set in current `frontend/.env.local` | Server-side destination for the Next.js API proxy; not accessed by browser code | `frontend/src/app/api/proxy/[...path]/route.ts`; `frontend/.env.local.example`; `README.md`; `docs/deployment.md` |
| `NEXT_PUBLIC_UNDO_HISTORY_LIMIT` | No | No | Optional | Optional; build-time value | Code fallback: `20`; example/current config: `10` | IMPLEMENTED; set in current `frontend/.env.local` | Positive finite value limits the shared canvas undo history | `frontend/src/lib/canvas/history.ts`; `frontend/.env.local.example` |
| `NEXT_PUBLIC_DEV_USER_NAME` | No | No | Optional | Do not configure for production | Built-in development identity | OPTIONAL; not set in current frontend env | Display name for the non-production stand-in identity | `frontend/src/auth/session.ts` |
| `NEXT_PUBLIC_DEV_USER_EMAIL` | No | No | Optional | Do not configure for production | Built-in development identity | OPTIONAL; not set in current frontend env | Email for the non-production stand-in identity | `frontend/src/auth/session.ts` |
| `K_SERVICE` | No operator setting | No | Absent locally | Set by Cloud Run | Cloud Run-provided | IMPLEMENTED; platform-managed | Selects the deployed proxy path, including service-to-service authentication | `frontend/src/app/api/proxy/[...path]/route.ts`; `docs/deployment.md` |
| `NODE_ENV` | No operator setting | No | Set by Node/Next tooling | Set by production runtime/build | Runtime-managed | IMPLEMENTED; platform/tool-managed | Prevents use of the development identity in production | `frontend/src/auth/session.ts` |

**Browser exposure:** `NEXT_PUBLIC_*` values are compiled into browser code.
The OAuth client ID, undo limit, and development identity values are not
secrets. Never put tokens, passwords, private keys, or other server credentials
in a `NEXT_PUBLIC_*` variable.

`BACKEND_URL` is read by the server-side route handler, not by client code. The
current code does not define or require `NEXT_PUBLIC_BACKEND_URL`.

## 5. Node.js Backend / BFF Environment Variables

| Variable | Required | Secret | Local | Cloud | Default / Example | Status | Purpose | Source |
|---|---|---|---|---|---|---|---|---|
| `PORT` | No | No | Optional; default `4000` | Cloud Run supplies the listening port | `4000` locally | IMPLEMENTED; set in current backend env | Express listen port | `backend/src/server.ts`; `backend/.env.example`; `docs/deployment.md` |
| `GOOGLE_OAUTH_CLIENT_ID` | For Google authentication | No | Optional for anonymous/dev mode | Required for normal Google-authenticated deployment | Same web OAuth client as frontend | IMPLEMENTED; non-empty in current backend env | Google ID-token audience for backend verification | `backend/src/middleware/requireIdentity.ts`; `backend/.env.example`; `docs/switching-to-gcp.md` |
| `SESSION_SECRET` | For persistent signed sessions | **Yes** | Recommended for persistent local sessions; dev mode can generate an ephemeral value | Required for persistent production sessions; supply through Secret Manager | `<SECRET>` placeholder only | IMPLEMENTED; non-empty in current backend env | Signs the 30-day app session JWT | `backend/src/lib/sessionToken.ts`; `backend/src/lib/sessionCookie.ts`; `docs/specs/001-auth-design.md`; `docs/deployment.md` |
| `ALLOWED_ORIGINS` | No in local dev; needed to permit configured cross-origin requests | No | Defaults to `http://localhost:3000` | Configure frontend origin(s) | Comma-separated origins | IMPLEMENTED; set in current backend env | CORS allowlist | `backend/src/server.ts`; `backend/.env.example`; `docs/deployment.md` |
| `ALLOWED_EMAIL_DOMAINS` | No; defaults to `accenture.com` | No | Optional | Configure approved user domains | Comma-separated domains | IMPLEMENTED; set in current backend env | Server-side email-domain allowlist | `backend/src/middleware/requireIdentity.ts`; `backend/.env.example`; `docs/switching-to-gcp.md` |
| `AUTH_MODE` | No | No | `dev` enables local email-based dev sign-in; otherwise local anonymous mode is available when Google OAuth is absent | Do not use `dev`; `anonymous` is only allowed with IAP explicitly enabled | Unset by default | OPTIONAL; not set in current backend env | Selects anonymous/dev/required authentication behavior | `backend/src/middleware/requireIdentity.ts`; `backend/src/lib/sessionToken.ts`; `backend/.env.example`; `docs/switching-to-gcp.md` |
| `IAP_PROTECTED` | Only for deployed anonymous mode | No | Not needed | Required only with `AUTH_MODE=anonymous` behind IAP | `true` or `1` | OPTIONAL; not set in current backend env | Explicitly declares that IAP protects an otherwise anonymous deployed backend | `backend/src/middleware/requireIdentity.ts` |
| `FIRESTORE_PROJECT_ID` | For cloud Firestore | No | Optional; empty selects local fallback unless emulator setup is used | Required for persistent Firestore deployment | GCP project ID | IMPLEMENTED; key present but empty in current backend env; MISSING for cloud storage mode | Selects project and enables Firestore mode | `backend/src/lib/firestore.ts`; `backend/src/lib/storageMode.ts`; `backend/.env.example`; `docs/deployment.md` |
| `GCS_BUCKET_NAME` | For cloud object storage | No | Optional; empty selects local fallback unless emulator setup is used | Required for GCS storage deployment | Bucket name | IMPLEMENTED; key present but empty in current backend env; MISSING for cloud storage mode | Selects the Cloud Storage bucket | `backend/src/lib/gcs.ts`; `backend/src/lib/storageMode.ts`; `backend/.env.example`; `docs/deployment.md` |
| `LOCAL_DATA_DIR` | No | No | Optional; defaults to backend `.data`; `memory` disables disk persistence | Not a durable Cloud Run storage option | `.data` or `memory` | IMPLEMENTED; not set in current backend env | Chooses local-disk directory or in-memory fallback | `backend/src/lib/storageMode.ts`; `backend/.env.example`; `docs/deployment.md` |
| `LOCAL_STORAGE_DIR` | No | No | Not used | Not used | No code default | CONFIGURED BUT UNUSED in current backend env | No effect; the implementation reads `LOCAL_DATA_DIR`, not this name | Current `backend/.env`; compare `backend/src/lib/storageMode.ts` and `backend/.env.example` |
| `FIRESTORE_EMULATOR_HOST` | Only for local Firestore emulator | No | Optional; set by `backend/emulators/env.sh` | Do not use for real Cloud Firestore | `127.0.0.1:8080` in emulator setup | IMPLEMENTED; optional local emulator setting | Directs the Firestore client to the emulator | `backend/src/lib/storageMode.ts`; `backend/src/lib/firestore.ts`; `backend/emulators/env.sh`; `docs/deployment.md` |
| `STORAGE_EMULATOR_HOST` | Only for local Storage emulator | No | Optional; set by `backend/emulators/env.sh` | Do not use for real Cloud Storage | `http://127.0.0.1:9199` in emulator setup | IMPLEMENTED; optional local emulator setting | Directs the Storage client to the emulator | `backend/src/lib/storageMode.ts`; `backend/src/lib/gcs.ts`; `backend/emulators/env.sh`; `docs/deployment.md` |
| `VERTEX_PROJECT_ID` | For real AI generation | No | Optional; unset enables placeholder generation | Optional for app startup, but required to use Vertex AI | GCP project ID | IMPLEMENTED; set in current backend env | Enables Vertex AI image, text, and video capabilities | `backend/src/capabilities/genai.ts`; `backend/src/capabilities/imagen.ts`; `backend/src/capabilities/geminiText.ts`; `backend/src/capabilities/veo.ts`; `backend/.env.example`; `docs/switching-to-gcp.md` |
| `VERTEX_LOCATION` | No | No | Optional | Optional for image/text; select an available location | `global` | IMPLEMENTED; set in current backend env | Vertex AI location used by image and text generation | `backend/src/capabilities/genai.ts`; `backend/.env.example`; `docs/deployment.md` |
| `VERTEX_VIDEO_LOCATION` | No | No | Optional | Optional when using Vertex video; select a supported region | `us-central1` | IMPLEMENTED; not set in current backend env | Video-specific location; Veo does not use the image/text `global` default | `backend/src/capabilities/veo.ts` |
| `MOCK_VIDEO_DELAY_MS` | No | No | Optional | Not normally useful in production | `3000` milliseconds for invalid/unset values | OPTIONAL; not set in current backend env | Controls the delay in mock video generation | `backend/src/capabilities/veo.ts` |
| `CLOUD_TASKS_QUEUE` | Required as part of the Cloud Tasks group for deployed backend | No | Optional; without the full group jobs run in-process | Required for deployed backend startup | `projects/<project>/locations/<region>/queues/<queue>` | MISSING from current backend env; required for Cloud Run video-job mode | Cloud Tasks queue resource name | `backend/src/lib/jobs/cloudTasks.ts`; `backend/src/lib/serviceModes.ts`; `backend/.env.example`; `docs/switching-to-gcp.md` |
| `CLOUD_TASKS_SERVICE_ACCOUNT` | Required as part of the Cloud Tasks group for deployed backend | No; identifies an account | Optional locally | Required for Cloud Tasks OIDC task identity | Service-account email | MISSING from current backend env; required for Cloud Run video-job mode | Identity whose OIDC token Cloud Tasks attaches to worker calls | `backend/src/lib/jobs/cloudTasks.ts`; `backend/.env.example`; `docs/switching-to-gcp.md` |
| `JOBS_WORKER_URL` | Required as part of the Cloud Tasks group for deployed backend | No | Optional locally | Required for Cloud Tasks video jobs | Backend service URL | MISSING from current backend env; required for Cloud Run video-job mode | Backend worker URL and OIDC audience | `backend/src/lib/jobs/cloudTasks.ts`; `backend/src/lib/serviceModes.ts`; `backend/.env.example`; `docs/switching-to-gcp.md` |
| `NODE_ENV` | No operator setting | No | Set by Node tooling | Production runtime sets production mode | Runtime-managed | IMPLEMENTED; platform/tool-managed | Detects deployed mode and controls secure session-cookie behavior | `backend/src/server.ts`; `backend/src/lib/storageMode.ts`; `backend/src/lib/sessionCookie.ts`; `backend/src/middleware/requireIdentity.ts` |
| `K_SERVICE` | No operator setting | No | Absent locally | Set by Cloud Run | Cloud Run-provided | IMPLEMENTED; platform-managed | Detects Cloud Run/deployed mode and enforces deploy checks | `backend/src/server.ts`; `backend/src/lib/storageMode.ts`; `backend/src/middleware/requireIdentity.ts` |
| `VITEST` | No application setting | No | Set by the test runner | Not applicable | Test-runner-managed | IMPLEMENTED; test-only | Makes storage tests default to memory rather than local disk | `backend/src/lib/storageMode.ts` |

`CLOUD_TASKS_QUEUE`, `CLOUD_TASKS_SERVICE_ACCOUNT`, and `JOBS_WORKER_URL` are
consumed only when all three are present. The backend refuses to start in a
deployed environment if it would otherwise run video jobs in-process.

## 6. FastAPI Environment Variables

There is no FastAPI service, Python application configuration, Python
requirements file, or FastAPI-specific `.env` in this checkout. No FastAPI
variable is implemented or verifiably required by architecture documentation.
Do not create a `FastAPI/.env` based on this repository alone.

The planned Node-to-FastAPI call would need a base URL, but no current code or
available architecture document defines one:

| Variable | Required | Secret | Local | Cloud | Default / Example | Status | Purpose | Source |
|---|---|---|---|---|---|---|---|---|
| `FASTAPI_BASE_URL` | Only if a separate FastAPI service is introduced | No | Potentially `http://localhost:8000` | FastAPI service URL | Suggested example only | PROPOSED; not configured or implemented | Node BFF destination for the planned FastAPI service | Proposed from the task's stated integration; no repository implementation or architecture-file evidence |

Confirm the integration contract, ownership, authentication, and URL naming
before treating this as required.

## 7. ADK / Agent Runtime Environment Variables

No ADK initialization, agent runtime, Python agent, or agent-service
configuration is present. No ADK/agent environment variable can be justified
from the checked-out code or architecture documents. Project/location settings
that are currently used by Vertex AI belong to the Node backend and are listed
in Sections 5 and 8; they do not establish that ADK is in use.

## 8. Google Cloud / Vertex AI Configuration

- `VERTEX_PROJECT_ID` enables real Vertex AI requests. Without it, current
  image/text/video capabilities use their mock or placeholder behavior.
- `VERTEX_LOCATION` defaults to `global` for image and text generation.
- `VERTEX_VIDEO_LOCATION` is a separate optional setting and defaults to
  `us-central1`; the Veo implementation does not reuse the global location.
- No API key or service-account JSON path is required by the implementation.
- Local development uses Application Default Credentials (ADC), documented as
  `gcloud auth application-default login`.
- On Cloud Run, use the service identity attached to the service and grant it
  the required Vertex role. Do not put service-account JSON credentials in
  `.env`.

The source does not read `GOOGLE_APPLICATION_CREDENTIALS`. It should not be
added as a mandatory variable for this application.

## 9. Firestore Configuration

`FIRESTORE_PROJECT_ID` selects Firestore mode. With the project set and
`FIRESTORE_EMULATOR_HOST` absent, the backend uses GCP Firestore. With the
emulator host set, it uses the local emulator. When the project is unset, the
backend selects its local-disk or memory fallback. Cloud Firestore needs no
separate credential-file variable: use local ADC or Cloud Run service identity.

## 10. Google Cloud Storage Configuration

`GCS_BUCKET_NAME` selects Cloud Storage mode. With the bucket set and
`STORAGE_EMULATOR_HOST` absent, the backend uses GCS. With the emulator host
set, it uses the local Storage emulator. Without a bucket, it uses local disk
or memory according to `LOCAL_DATA_DIR` and runtime mode.

`LOCAL_STORAGE_DIR` in the current backend `.env` has no effect; the matching
implementation setting is `LOCAL_DATA_DIR`. Production deployment checks
reject non-GCP storage modes so Cloud Run's ephemeral local disk is not used as
persistent storage.

## 11. Authentication and Session Configuration

- `GOOGLE_OAUTH_CLIENT_ID` is the backend's Google ID-token audience;
  `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` is the corresponding browser client ID.
  Neither is a client secret.
- `SESSION_SECRET` signs the long-lived session JWT. An unset secret makes
  persistent sessions inert except that local dev sign-in can use an
  ephemeral per-process secret. Production should set a stable value through
  Secret Manager.
- `ALLOWED_EMAIL_DOMAINS` is checked server-side for authenticated identities.
- `AUTH_MODE=dev` enables the local email-based placeholder and is rejected on
  deployed environments. With OAuth unconfigured, local backend mode defaults
  to anonymous.
- Deployed anonymous mode is refused unless both `AUTH_MODE=anonymous` and
  `IAP_PROTECTED=true` (or `1`) are set.
- The frontend's Google ID token is held in memory; the app session is an
  HttpOnly cookie. No environment variable should store user tokens.

## 12. Service-to-Service Communication

| Hop | Configuration owner | Current setting / behavior |
|---|---|---|
| Browser -> frontend | Frontend | Browser calls the same-origin `/api/proxy`; no backend URL is exposed to client components |
| Frontend proxy -> Node backend | Frontend service | `BACKEND_URL`; defaults to localhost for local development |
| Cloud Run frontend -> Cloud Run backend | Frontend Cloud Run service identity and backend IAM | Proxy uses Google Auth/Cloud Run identity to mint an OIDC invoker token for the backend URL; `BACKEND_URL` supplies the target/audience |
| Node backend -> FastAPI | None in current implementation | No call or URL setting exists; `FASTAPI_BASE_URL` is PROPOSED only |
| FastAPI -> ADK / Agent Runtime | None in current implementation | No service or configuration exists in this checkout |
| Node backend -> Vertex AI / Firestore / GCS / Cloud Tasks | Backend service identity and backend env | ADC locally; Cloud Run service identity in production; service-specific variables are listed above |

The proxy forwards the user's identity credential separately from the
Cloud Run infrastructure credential. Do not replace this with a browser-visible
backend URL or a static service token.

## 13. Local Development Configuration

The following are sanitized examples, not copies of local values.

`frontend/.env.local`:

```dotenv
NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID=<oauth-web-client-id>
BACKEND_URL=http://localhost:4000
NEXT_PUBLIC_UNDO_HISTORY_LIMIT=10
# Optional development stand-in identity:
# NEXT_PUBLIC_DEV_USER_NAME=<display-name>
# NEXT_PUBLIC_DEV_USER_EMAIL=<email-address>
```

`backend/.env`:

```dotenv
PORT=4000
ALLOWED_ORIGINS=http://localhost:3000
GOOGLE_OAUTH_CLIENT_ID=<oauth-web-client-id>
SESSION_SECRET=<SECRET>
ALLOWED_EMAIL_DOMAINS=accenture.com
FIRESTORE_PROJECT_ID=
GCS_BUCKET_NAME=
VERTEX_PROJECT_ID=<gcp-project-id>
VERTEX_LOCATION=global
# Optional:
# AUTH_MODE=dev
# LOCAL_DATA_DIR=.data
```

For emulator use, source `backend/emulators/env.sh`; it sets the project,
emulator hosts, and demo bucket. For local ADC, follow `docs/deployment.md`.

No `FastAPI/.env` example is included because there is no FastAPI service in
the repository and no documented FastAPI settings contract.

## 14. Cloud / Production Configuration

Supply plain configuration through Cloud Run environment configuration:

- Frontend: `BACKEND_URL`, and `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` at build
  time for Google sign-in.
- Backend: `GOOGLE_OAUTH_CLIENT_ID`, `ALLOWED_ORIGINS`,
  `ALLOWED_EMAIL_DOMAINS`, `FIRESTORE_PROJECT_ID`, `GCS_BUCKET_NAME`, and
  `VERTEX_PROJECT_ID` if real generation is enabled.
- Backend video jobs: all of `CLOUD_TASKS_QUEUE`,
  `CLOUD_TASKS_SERVICE_ACCOUNT`, and `JOBS_WORKER_URL`. The current backend
  startup guard requires Cloud Tasks mode when deployed.
- `VERTEX_LOCATION` and `VERTEX_VIDEO_LOCATION` may be set where the model
  region requires it; their code defaults are documented above.

Supply `SESSION_SECRET` through Secret Manager. Use each Cloud Run service's
attached service identity for Google APIs and OIDC; no service-account JSON
file should be placed in the image, repository, or `.env`. Cloud Run provides
`PORT` and `K_SERVICE`; do not hardcode those as service secrets/configuration.

## 15. Missing Environment Variables

| Variable | Component | Why required | Evidence | Expected value/example | Secret | Required locally | Required in cloud | Status |
|---|---|---|---|---|---|---|---|---|
| `CLOUD_TASKS_QUEUE` | Node backend | Deployed backend must dispatch video jobs through Cloud Tasks rather than in-process execution | `backend/src/lib/serviceModes.ts`; `backend/src/lib/jobs/cloudTasks.ts`; `docs/switching-to-gcp.md` | `projects/<project>/locations/<region>/queues/<queue>` | No | No | Yes | MISSING from current backend env; deployment requirement |
| `CLOUD_TASKS_SERVICE_ACCOUNT` | Node backend / Cloud Tasks | Task OIDC identity is required by the dispatcher and worker auth | `backend/src/lib/jobs/cloudTasks.ts`; `docs/switching-to-gcp.md` | `<tasks-account>@<project>.iam.gserviceaccount.com` | No (identity name) | No | Yes | MISSING from current backend env; deployment requirement |
| `JOBS_WORKER_URL` | Node backend / Cloud Tasks | Worker destination and OIDC audience are required by the dispatcher | `backend/src/lib/jobs/cloudTasks.ts`; `backend/src/lib/serviceModes.ts`; `docs/switching-to-gcp.md` | `https://<backend-service>.run.app` | No | No | Yes | MISSING from current backend env; deployment requirement |
| `FIRESTORE_PROJECT_ID` | Node backend | Needed to select durable GCP Firestore mode | `backend/src/lib/storageMode.ts`; `docs/deployment.md` | `<gcp-project-id>` | No | No for local fallback; yes for local GCP | Yes for durable cloud storage | Key is present but empty in current backend env |
| `GCS_BUCKET_NAME` | Node backend | Needed to select durable GCS mode | `backend/src/lib/storageMode.ts`; `docs/deployment.md` | `<bucket-name>` | No | No for local fallback; yes for local GCP | Yes for durable cloud storage | Key is present but empty in current backend env |

The three Cloud Tasks settings are a group: they are optional for a local
backend process but required for the currently implemented Cloud Run backend
deployment guard. `FASTAPI_BASE_URL` is not included here because it is
PROPOSED, not a requirement established by current code or available
architecture documents.

## 16. Unused / Potentially Obsolete Variables

- **`LOCAL_STORAGE_DIR`** is set in the current `backend/.env`, but no
  application source reads it. Current source and `.env.example` use
  `LOCAL_DATA_DIR`. The current local storage default is `.data`; confirm
  whether the key should be renamed in the local environment separately.
- No other current `.env` key was found to be unused by the implementation.
- `NEXT_PUBLIC_UNDO_HISTORY_LIMIT` is used. However, the current frontend
  example/comment advertises `10` as its default while the implementation's
  fallback is `20`. The current local env explicitly sets `10`, so it remains
  an active override; align the comment/default when maintaining examples.
- `docs/deployment.md` lists `K_SERVICE` as a frontend required variable even
  though Cloud Run supplies it, and does not list the Cloud Tasks trio even
  though deployed startup currently requires Cloud Tasks mode. The details
  exist in `docs/switching-to-gcp.md`; reconcile the deployment summary.

## 17. Security Considerations

- Never commit or expose `SESSION_SECRET`; use a placeholder in examples and
  Secret Manager for production.
- The inspected working-tree `backend/.env` contains a non-empty
  `SESSION_SECRET`. Its value is not reproduced. Whether that local file is
  tracked by Git could not be verified in this environment; confirm it is
  ignored and rotate the secret if it was ever committed or shared.
- Never put server secrets, service-account credentials, tokens, or API keys in
  `NEXT_PUBLIC_*`.
- Google OAuth client IDs are public identifiers, not client secrets. Keep
  OAuth client secrets (if separately introduced) out of frontend variables.
- Do not commit service-account JSON credentials. Use ADC locally and Cloud
  Run service identities in production.
- Use `AUTH_MODE=dev` only for local development. Do not enable deployed
  anonymous mode unless IAP is actually in front of the service and
  `IAP_PROTECTED` is set accordingly.
- `.env.example` files may contain non-secret names, safe defaults, and
  unmistakable placeholders. A real `SESSION_SECRET`, credential file,
  private key, or access token must never appear in an example or documentation.

## 18. Environment Variable Matrix

`Auto` means supplied by the platform/tooling, not set manually.

| Variable | Frontend | Node BFF | FastAPI | ADK | Local | Cloud | Secret | Status |
|---|---|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` | Yes |  |  |  | Optional | Google auth | No | IMPLEMENTED |
| `BACKEND_URL` | Yes (server-side proxy) |  |  |  | Local default | Backend service URL | No | IMPLEMENTED |
| `NEXT_PUBLIC_UNDO_HISTORY_LIMIT` | Yes |  |  |  | Optional | Optional build config | No | IMPLEMENTED |
| `NEXT_PUBLIC_DEV_USER_NAME` | Yes |  |  |  | Optional | No | No | OPTIONAL |
| `NEXT_PUBLIC_DEV_USER_EMAIL` | Yes |  |  |  | Optional | No | No | OPTIONAL |
| `GOOGLE_OAUTH_CLIENT_ID` |  | Yes |  |  | Optional by auth mode | Google auth | No | IMPLEMENTED |
| `SESSION_SECRET` |  | Yes |  |  | Optional for ephemeral dev session | Yes for persistent sessions | **Yes** | IMPLEMENTED |
| `ALLOWED_ORIGINS` |  | Yes |  |  | Default exists | Configure origins | No | IMPLEMENTED |
| `ALLOWED_EMAIL_DOMAINS` |  | Yes |  |  | Default exists | Configure policy | No | IMPLEMENTED |
| `AUTH_MODE` |  | Yes |  |  | Optional | `dev` forbidden | No | OPTIONAL |
| `IAP_PROTECTED` |  | Yes |  |  | No | Only alternate IAP auth | No | OPTIONAL |
| `PORT` |  | Yes |  |  | Optional | Auto | No | IMPLEMENTED |
| `FIRESTORE_PROJECT_ID` |  | Yes |  |  | Optional for fallback/emulator | Required for cloud Firestore | No | IMPLEMENTED; empty currently |
| `FIRESTORE_EMULATOR_HOST` |  | Yes |  |  | Optional emulator | No | No | OPTIONAL |
| `GCS_BUCKET_NAME` |  | Yes |  |  | Optional for fallback/emulator | Required for GCS | No | IMPLEMENTED; empty currently |
| `STORAGE_EMULATOR_HOST` |  | Yes |  |  | Optional emulator | No | No | OPTIONAL |
| `LOCAL_DATA_DIR` |  | Yes |  |  | Optional | No durable cloud use | No | IMPLEMENTED; unset |
| `LOCAL_STORAGE_DIR` |  | Yes (not read) |  |  | No effect | No effect | No | CONFIGURED BUT UNUSED |
| `VERTEX_PROJECT_ID` |  | Yes |  |  | Optional; placeholder otherwise | Optional; needed for real AI | No | IMPLEMENTED |
| `VERTEX_LOCATION` |  | Yes |  |  | Optional; `global` default | Optional | No | IMPLEMENTED |
| `VERTEX_VIDEO_LOCATION` |  | Yes |  |  | Optional; `us-central1` default | Optional for video | No | OPTIONAL |
| `MOCK_VIDEO_DELAY_MS` |  | Yes |  |  | Optional | Usually unused | No | OPTIONAL |
| `CLOUD_TASKS_QUEUE` |  | Yes |  |  | Optional | Required | No | MISSING from current env |
| `CLOUD_TASKS_SERVICE_ACCOUNT` |  | Yes |  |  | Optional | Required | No | MISSING from current env |
| `JOBS_WORKER_URL` |  | Yes |  |  | Optional | Required | No | MISSING from current env |
| `FASTAPI_BASE_URL` |  | Proposed |  |  | Only if implemented | Only if implemented | No | PROPOSED |
| `NODE_ENV` | Yes | Yes |  |  | Auto | Auto | No | IMPLEMENTED; runtime-managed |
| `K_SERVICE` | Yes | Yes |  |  | Absent | Auto on Cloud Run | No | IMPLEMENTED; runtime-managed |
| `VITEST` |  | Yes (tests) |  |  | Test-runner only | No | No | IMPLEMENTED; test-only |

No FastAPI or ADK column entries are populated because those services are not
implemented in this checkout.

## 19. Findings / Open Questions

1. The numbered frozen-architecture documents and the requested
   `Architecture_References/`, `FastAPI/`, and `Node_BFF/` directories are
   absent. The intended Node-to-FastAPI and FastAPI-to-ADK contracts, including
   auth, timeouts, retries, identity propagation, and ownership of project
   configuration, cannot be verified.
2. `FASTAPI_BASE_URL` is only a suggested name. A maintainer must confirm it
   (or define another contract) before integration work.
3. The current backend environment uses `LOCAL_STORAGE_DIR`, while the code
   and example use `LOCAL_DATA_DIR`. Confirm intended local directory behavior.
4. The current backend env has empty `FIRESTORE_PROJECT_ID` and
   `GCS_BUCKET_NAME`; this is consistent with local fallback, but not with the
   Cloud Run durable-storage startup requirement.
5. The current backend env has a non-empty `SESSION_SECRET`; its value is
   intentionally excluded from this document. Confirm the file is untracked
   and ignored, and rotate the secret if it was exposed.
6. Cloud Tasks variables are absent from the current backend env and are
   required by the deployed backend startup guard. The deployment guide's
   required-variable table should be reconciled with `docs/switching-to-gcp.md`
   and current code.
7. The undo-history example says `10` is the default, but source fallback is
   `20`. The current local env explicitly sets `10`.
8. The task's supplied backend environment snapshot says the OAuth client ID
   and session secret are empty, but the inspected working-tree backend `.env`
   has both set (the secret is non-empty). The document follows the working
   tree's key/value-presence state and reveals neither value.
9. The current backend `.env` allows `http://localhost:5173`, while the
   repository's README starts the Next.js frontend at `http://localhost:3000`.
   The proxy calls the backend server-to-server, so this may not block the
   normal proxied local flow; align the CORS value if browser-origin requests
   are expected.

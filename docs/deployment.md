# Deployment Guide

## Services

| Service | Target | Notes |
|---|---|---|
| `frontend/` | Cloud Run | Next.js SSR, `output: "standalone"` |
| `backend/` | Cloud Run | Express ESM, port 8080 |

## Required env vars

### frontend

| Var | Description |
|---|---|
| `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` | Google OAuth client ID (inlined at build time) |
| `BACKEND_URL` | Internal Cloud Run URL of the backend service |
| `K_SERVICE` | Set automatically by Cloud Run — used to detect production |

### backend

| Var | Description |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth client ID for ID token verification |
| `SESSION_SECRET` | Secret for signing 30-day session JWTs — store in Secret Manager |
| `IDENTITY_LINK_HMAC_KEY` | Key for identity links (Google account → owner key, #488), at least 32 bytes hex or base64 — store in Secret Manager; required when deployed |
| `SESSION_MODE` | `jwt` (default, signed 30-day tokens) or `opaque` (revocable server sessions in `login_sessions`, #489); switching signs everyone out once |
| `SESSION_IDLE_SECONDS`, `SESSION_ABSOLUTE_SECONDS` | Opaque sessions' idle and absolute deadlines (defaults 604800 and 2592000) |
| `IDENTITY_LINK_HMAC_KEY_VERSION` | Optional, default `1`; part of every link ID, so change it only with a link migration |
| `ALLOWED_ORIGINS` | Comma-separated frontend origins, exactly (e.g. `https://frontend-xyz.run.app`). Used for CORS and the CSRF check: signed-in changes from any other origin are refused. Must be HTTPS when deployed; unset when deployed, every signed-in change is refused |
| `ALLOWED_EMAIL_DOMAINS` | Comma-separated allowed email domains (e.g. `accenture.com`) |
| `ALLOWED_HOSTED_DOMAINS` | Comma-separated Google Workspace domains (the ID token's `hd`); defaults to `ALLOWED_EMAIL_DOMAINS` |
| `GOOGLE_ID_TOKEN_CLOCK_SKEW_SECONDS` | Optional slack on a Google token's expiry, 0–300 (default 300) |
| `FIRESTORE_PROJECT_ID` | GCP project ID for Firestore |
| `GCS_BUCKET_NAME` | GCS bucket name for asset storage |
| `VERTEX_PROJECT_ID` | GCP project ID for Vertex AI Imagen 3 |
| `VERTEX_LOCATION` | Vertex AI region — Nano Banana models require `global` (default: `global`) |
| `FASTAPI_BASE_URL` | The private FastAPI service's URL (#494); unset, a placeholder in memory. HTTPS when deployed |
| `FASTAPI_AUDIENCE` | Optional: the service token's audience, if not `FASTAPI_BASE_URL` |
| `FASTAPI_JOB_TIMEOUT_MS`, `FASTAPI_SKILLS_TIMEOUT_MS`, `FASTAPI_HELPER_TIMEOUT_MS` | Optional timeouts for FastAPI calls (defaults 15000, 10000, 30000) |
| `RUN_MAX_ASSETS`, `RUN_MAX_ASSET_BYTES`, `RUN_MAX_SKILLS`, `RUN_MAX_SKILL_BYTES`, `RUN_MAX_SKILLS_TOTAL_BYTES`, `RUN_MAX_INSTRUCTION_CHARS`, `RUN_MAX_COUNT`, `RUN_MAX_PARENTS` | Optional Run admission limits (#493); defaults are today's numbers (5, 25 MiB, 20, 100 KiB, 400 KiB, 30000, 10, 10) |
| `RUN_IDEMPOTENCY_RETENTION_SECONDS` | Optional: how long a Run click is recognised as a replay (#491; default 604800, 7 days) |
| `RUN_LOCK_STALE_SECONDS` | Optional: a Playspace lock held longer than this is logged as stale (#492; default 1500, the 25 min job limit) |
| `PORT` | Server port (default: 4000 locally, set to 8080 by Cloud Run) |
| `FIRESTORE_EMULATOR_HOST` | Local only: the Firestore emulator (`127.0.0.1:8080`) |
| `STORAGE_EMULATOR_HOST` | Local only: the Storage emulator (`http://127.0.0.1:9199`) |

> Without GCP access yet? Every service has a placeholder; [switching-to-gcp.md](switching-to-gcp.md) is the checklist for moving each one.

## Where data goes (storage modes)

Each store picks its mode from env alone, and the backend logs both at startup
(see switching-to-gcp.md). Nothing crashes on a missing key; a deployed backend refuses to start on local disk or memory.

| Firestore | Storage | Set |
|---|---|---|
| **local disk** (placeholder) | **local disk** | nothing: the default for `npm run dev` (`LOCAL_DATA_DIR`, default `backend/.data`) |
| **memory** (lost on restart) | **memory** | tests, or `LOCAL_DATA_DIR=memory` |
| **emulator** | **emulator** | the project / bucket, plus `FIRESTORE_EMULATOR_HOST` / `STORAGE_EMULATOR_HOST` |
| **GCP** | **GCP** | `FIRESTORE_PROJECT_ID` / `GCS_BUCKET_NAME` only |

## Local emulators

The Firestore and Storage emulators run from Firebase's CLI (pinned, fetched
by `npx`; nothing to install but **Java 21**, e.g. `brew install --cask temurin@21`).
`demo-` project ids are offline-only: nothing reaches GCP, and no login is needed.

```bash
cd backend
npm run dev:emulators                 # terminal 1: Firestore :8080, Storage :9199
. emulators/env.sh && npm run dev     # terminal 2: the backend against them
npm run test:emulators                # or: start them, run every test, stop them
```

The plain `npm test` skips the emulator tests; CI's `backend-emulators` job runs
them. `emulators/storage.rules` lets the unauthenticated backend into the
Storage emulator and is never deployed: real buckets use IAM.

## Staging project

A project of its own, so staging data and permissions never touch production.

```bash
PROJECT=gcos-staging REGION=us-central1
gcloud config set project $PROJECT
gcloud services enable firestore.googleapis.com storage.googleapis.com \
  run.googleapis.com aiplatform.googleapis.com secretmanager.googleapis.com

# Firestore (Native mode)
gcloud firestore databases create --location=$REGION

# The bucket: uniform access, never public
gcloud storage buckets create gs://$PROJECT-assets --location=$REGION \
  --uniform-bucket-level-access --public-access-prevention

# The backend's service account, with only what it uses
gcloud iam service-accounts create gcos-backend
SA=gcos-backend@$PROJECT.iam.gserviceaccount.com
gcloud projects add-iam-policy-binding $PROJECT --member=serviceAccount:$SA --role=roles/datastore.user
gcloud projects add-iam-policy-binding $PROJECT --member=serviceAccount:$SA --role=roles/aiplatform.user
gcloud storage buckets add-iam-policy-binding gs://$PROJECT-assets \
  --member=serviceAccount:$SA --role=roles/storage.objectAdmin
```

Deploy the backend with `--service-account=$SA`,
`FIRESTORE_PROJECT_ID=$PROJECT` and `GCS_BUCKET_NAME=$PROJECT-assets`; `/api/health`
then probes both. Production's full setup (the frontend's account, Cloud Tasks,
secrets) is #326.

## Secrets (Secret Manager)

`SESSION_SECRET` and `IDENTITY_LINK_HMAC_KEY` must be provisioned in GCP Secret Manager and
injected as env vars at deploy time:

```bash
gcloud secrets create gcos-session-secret --data-file=-
# paste the secret value, then Ctrl+D
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create gcos-identity-link-key --data-file=-

gcloud run deploy gcos-backend \
  --set-secrets SESSION_SECRET=gcos-session-secret:latest,IDENTITY_LINK_HMAC_KEY=gcos-identity-link-key:latest
```

## Cloud Run deploy (backend)

```bash
cd backend
gcloud run deploy gcos-backend \
  --source . \
  --region us-central1 \
  --set-env-vars GOOGLE_OAUTH_CLIENT_ID=<id>,ALLOWED_ORIGINS=<frontend-url>,FIRESTORE_PROJECT_ID=<project>,GCS_BUCKET_NAME=<bucket>,VERTEX_PROJECT_ID=<project> \
  --set-secrets SESSION_SECRET=gcos-session-secret:latest,IDENTITY_LINK_HMAC_KEY=gcos-identity-link-key:latest \
  --no-allow-unauthenticated
```

## Cloud Run deploy (frontend)

```bash
cd frontend
gcloud run deploy gcos-frontend \
  --source . \
  --region us-central1 \
  --set-env-vars BACKEND_URL=<backend-cloud-run-url>,NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID=<id> \
  --allow-unauthenticated
```

## Service-to-service auth

The backend is deployed with `--no-allow-unauthenticated`. The frontend's Cloud Run service
account must have the `roles/run.invoker` IAM role on the backend service:

```bash
gcloud run services add-iam-policy-binding gcos-backend \
  --member=serviceAccount:<frontend-sa>@<project>.iam.gserviceaccount.com \
  --role=roles/run.invoker \
  --region us-central1
```

The frontend proxy (`/api/proxy/[...path]/route.ts`) mints an OIDC identity token for this
service account and attaches it to `Authorization` on every backend request.

## Firestore setup

```bash
gcloud firestore databases create --region=us-central1
```

Collections created at runtime (no schema migration needed):
- `boards/{boardId}` — board documents scoped by userId

## Vertex AI setup

Image generation uses the Vertex AI Generative AI API (Nano Banana / Gemini image models).

**Local dev** — copy `.env.example` to `.env` and fill in `VERTEX_PROJECT_ID`:

```bash
cp backend/.env.example backend/.env
# then set: VERTEX_PROJECT_ID=your-gcp-project-id
```

GCP Application Default Credentials must be configured locally:

```bash
gcloud auth application-default login
```

**Cloud Run** — the backend service account needs the Vertex AI user role so it can call the Generative AI API:

```bash
# Find the backend service account
gcloud run services describe gcos-backend --region us-central1 \
  --format="value(spec.template.spec.serviceAccountName)"

# Grant Vertex AI access
gcloud projects add-iam-policy-binding <project-id> \
  --member=serviceAccount:<backend-sa>@<project-id>.iam.gserviceaccount.com \
  --role=roles/aiplatform.user
```

If `VERTEX_PROJECT_ID` is not set, the backend returns a mock placeholder image rather than calling Vertex AI — no crash, no error.

## GCS bucket setup

```bash
gcloud storage buckets create gs://<GCS_BUCKET_NAME> --location=us-central1 \
  --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets add-iam-policy-binding gs://<GCS_BUCKET_NAME> \
  --member=serviceAccount:<backend-sa> --role=roles/storage.objectAdmin
```

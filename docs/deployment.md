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
| `ALLOWED_ORIGINS` | Comma-separated frontend origins (e.g. `https://frontend-xyz.run.app`) |
| `ALLOWED_EMAIL_DOMAINS` | Comma-separated allowed email domains (e.g. `accenture.com`) |
| `FIRESTORE_PROJECT_ID` | GCP project ID for Firestore |
| `GCS_BUCKET_NAME` | GCS bucket name for asset storage |
| `VERTEX_PROJECT_ID` | GCP project ID for Vertex AI Imagen 3 |
| `VERTEX_LOCATION` | Vertex AI region (default: `us-central1`) |
| `PORT` | Server port (default: 4000 locally, set to 8080 by Cloud Run) |

## Secrets (Secret Manager)

`SESSION_SECRET` must be provisioned in GCP Secret Manager and injected as an env var at
deploy time:

```bash
gcloud secrets create gcos-session-secret --data-file=-
# paste the secret value, then Ctrl+D

gcloud run deploy gcos-backend \
  --set-secrets SESSION_SECRET=gcos-session-secret:latest
```

## Cloud Run deploy (backend)

```bash
cd backend
gcloud run deploy gcos-backend \
  --source . \
  --region us-central1 \
  --set-env-vars GOOGLE_OAUTH_CLIENT_ID=<id>,ALLOWED_ORIGINS=<frontend-url>,FIRESTORE_PROJECT_ID=<project>,VERTEX_PROJECT_ID=<project> \
  --set-secrets SESSION_SECRET=gcos-session-secret:latest \
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

## GCS bucket setup

```bash
gsutil mb -l us-central1 gs://<GCS_BUCKET_NAME>
gsutil iam ch serviceAccount:<backend-sa>:roles/storage.objectAdmin gs://<GCS_BUCKET_NAME>
```

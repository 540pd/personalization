# Switching from placeholders to GCP

Every service the backend uses has a **placeholder** that runs with no GCP project,
Google client or Accenture login, so the whole app works locally. Each one is
chosen by environment variables alone: moving a service to GCP is setting its
variables and restarting, **never a code change**. Services switch one at a time.

| Service | Placeholder (default) | Real service | Set |
|---|---|---|---|
| Sign-in | anonymous, or **dev sign-in** with `AUTH_MODE=dev` | Google, `ALLOWED_EMAIL_DOMAINS` only | `GOOGLE_OAUTH_CLIENT_ID`, `SESSION_SECRET`; frontend `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` |
| Data and files | local disk at `backend/.data` | Firestore + Cloud Storage | `FIRESTORE_PROJECT_ID`, `GCS_BUCKET_NAME` |
| AI generation | offline placeholders | Vertex AI | `VERTEX_PROJECT_ID` (and `VERTEX_LOCATION`) |

## How to tell what is running

The backend prints one line per service at startup, with the variables that would
switch it:

```
GCOS backend listening on http://localhost:4000
  sign-in: anonymous (placeholder) -- to switch: GOOGLE_OAUTH_CLIENT_ID, SESSION_SECRET
  storage: local disk at …/backend/.data (placeholder) -- to switch: FIRESTORE_PROJECT_ID, GCS_BUCKET_NAME
  AI:      offline placeholders -- to switch: VERTEX_PROJECT_ID
```

`GET /api/health` answers the same as `modes`, plus a probe of each configured
store (`ok`, `storage`):

```bash
curl -s localhost:4000/api/health
# {"ok":true,"storage":"ok","modes":{"auth":"anonymous","storage":{"firestore":"local","storage":"local"},"ai":"placeholder"},…}
```

A deployed backend (`K_SERVICE` or `NODE_ENV=production`) **refuses to start** on
the storage placeholder, so a misconfigured deploy fails loudly instead of keeping
data on an instance's disk. Placeholder AI is allowed deployed (it costs nothing)
and warned about.

## Data and files: Firestore + Cloud Storage

1. Create the project's Firestore database and bucket, and the backend's service
   account with only `roles/datastore.user` and `roles/storage.objectAdmin` on the
   bucket: the **Staging project** recipe in [deployment.md](deployment.md).
2. Locally, sign in for Application Default Credentials:
   `gcloud auth application-default login`. On Cloud Run, deploy with
   `--service-account` instead.
3. Set both, and restart:
   ```bash
   FIRESTORE_PROJECT_ID=<project>
   GCS_BUCKET_NAME=<bucket>
   ```
4. Verify: `modes.storage` is `{ "firestore": "gcp", "storage": "gcp" }` and
   `storage` is `"ok"`.

Notes:
- Both are needed: with only one set, assets stay on the local fallback (logged).
- Local-disk data is not copied to GCP. A board comes across through the one-time
  import of the browser's board (#324); local assets stay local.
- Without GCP but with Java 21, the emulators are a closer stand-in: see
  **Local emulators** in [deployment.md](deployment.md).

## Sign-in: the dev placeholder

`AUTH_MODE=dev` (local only) replaces Google's button with an email field: the
email typed is who you are, and from there it is the production path (session
cookie, reload, sign out, the session-ended banner). The domain allowlist still
applies. Without `SESSION_SECRET` a secret is made per start, so sessions end when
the backend restarts. A deployed backend refuses to start with it.

## Sign-in: Google

1. In the project's **APIs & Services → Credentials**, create an **OAuth client ID**
   of type *Web application*, with the frontend's origin(s) under *Authorized
   JavaScript origins* (e.g. `http://localhost:3000`, the Cloud Run URL).
2. Generate a session secret: `openssl rand -base64 48`. Deployed, keep it in Secret
   Manager (see deployment.md, **Secrets**); rotating it signs everyone out.
3. Set, and restart both:
   ```bash
   # backend
   GOOGLE_OAUTH_CLIENT_ID=<client id>
   SESSION_SECRET=<secret>
   ALLOWED_EMAIL_DOMAINS=accenture.com
   # frontend (inlined at build time)
   NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID=<the same client id>
   ```
   Unset `AUTH_MODE` (the dev placeholder) if it was set.
4. Verify: `modes.auth` is `"required"`; the app opens on the sign-in screen with
   Google's button; after signing in, a reload stays signed in (the session cookie).

**Verify on first use:** Google's token check is covered by tests only with Google
stubbed; the first real sign-in is its first real run.

## AI generation: the placeholders

Without `VERTEX_PROJECT_ID`, images are gradients the backend draws at the
requested aspect ratio (a new tint per variant), stored and sent on as references
like real outputs; text and video answer canned placeholders. No network is used.

## AI generation: Vertex AI

1. Enable the Vertex AI API in the project, and give the backend's identity
   `roles/aiplatform.user` (deployment.md, **Vertex AI setup**).
2. Set, and restart: `VERTEX_PROJECT_ID=<project>` (`VERTEX_LOCATION` defaults to
   `global`, which the Nano Banana models need).
3. Verify: `modes.ai` is `"vertex"`; a generated image is a real one.

**Verify on first use:** real generation is billed and has not run in CI.

## Checking everything at once

A smoke test that runs the checks above against any backend URL is #336.

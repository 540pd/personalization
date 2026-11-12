# Switching from placeholders to GCP

Every service the backend uses has a **placeholder** that runs with no GCP project,
Google client or Accenture login, so the whole app works locally. Each one is
chosen by environment variables alone: moving a service to GCP is setting its
variables and restarting, **never a code change**. Services switch one at a time.

| Service | Placeholder (default) | Real service | Set |
|---|---|---|---|
| Sign-in | anonymous, or **dev sign-in** with `AUTH_MODE=dev` | Google Workspace accounts: `hd` in `ALLOWED_HOSTED_DOMAINS` (defaults to `ALLOWED_EMAIL_DOMAINS`) | `GOOGLE_OAUTH_CLIENT_ID`, `SESSION_SECRET`; frontend `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` |
| Data and files | local disk at `backend/.data` | Firestore + Cloud Storage | `FIRESTORE_PROJECT_ID`, `GCS_BUCKET_NAME` |
| AI generation | offline placeholders | Vertex AI | `VERTEX_PROJECT_ID` (and `VERTEX_LOCATION`) |
| Video jobs | in process, picked up again after a restart | Cloud Tasks | `CLOUD_TASKS_QUEUE`, `CLOUD_TASKS_SERVICE_ACCOUNT`, `JOBS_WORKER_URL` |
| Support email | messages kept and logged, not emailed | any SMTP server | `SUPPORT_EMAIL_TO`, `SUPPORT_EMAIL_FROM`, `SMTP_HOST` (and `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`) |
| FastAPI (Skills, job creation) | in memory, checks nothing | the private FastAPI service on Cloud Run | `FASTAPI_BASE_URL` (and `FASTAPI_AUDIENCE`) |

## How to tell what is running

The backend prints one line per service at startup, with the variables that would
switch it:

```
GCOS backend listening on http://localhost:4000
  sign-in: anonymous (placeholder) -- to switch: GOOGLE_OAUTH_CLIENT_ID, SESSION_SECRET
  sessions: signed 30-day tokens (jwt) -- to switch: SESSION_MODE=opaque (signs everyone out once)
  storage: local disk at …/backend/.data (placeholder) -- to switch: FIRESTORE_PROJECT_ID, GCS_BUCKET_NAME
  AI:      offline placeholders -- to switch: VERTEX_PROJECT_ID
  jobs:    in process (placeholder) -- to switch: CLOUD_TASKS_QUEUE, CLOUD_TASKS_SERVICE_ACCOUNT, JOBS_WORKER_URL
  support: kept and logged, not emailed (placeholder) -- to switch: SUPPORT_EMAIL_TO, SUPPORT_EMAIL_FROM, SMTP_HOST
  FastAPI: in memory (placeholder) -- to switch: FASTAPI_BASE_URL
```

`GET /api/health` answers the same as `modes`, plus a probe of each configured
store (`ok`, `storage`):

```bash
curl -s localhost:4000/api/health
# {"ok":true,"storage":"ok","modes":{"auth":"anonymous","storage":{"firestore":"local","storage":"local"},"ai":"placeholder"},…}
```

A deployed backend (`K_SERVICE` or `NODE_ENV=production`) **refuses to start** on
the storage placeholder, so a misconfigured deploy fails loudly instead of keeping
data on an instance's disk, or with video jobs in process (Cloud Run throttles a
request's CPU once it has answered, so they would stall). Placeholder AI is allowed
deployed (it costs nothing) and warned about, and so is support email that is not
set up.

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
   `storage` is `"ok"`; `npm run smoke` passes **assets** and **boards**.

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
   Generate the identity-link key too: `openssl rand -hex 32`, also in Secret
   Manager. It keys each Google account's link to its owner (#488); a deployed
   backend refuses to start without it. Changing it, or its version, makes new
   links: do that only with a link migration, never by itself.
3. Set, and restart both:
   ```bash
   # backend
   GOOGLE_OAUTH_CLIENT_ID=<client id>
   SESSION_SECRET=<secret>
   IDENTITY_LINK_HMAC_KEY=<key>
   ALLOWED_EMAIL_DOMAINS=accenture.com
   # ALLOWED_HOSTED_DOMAINS=accenture.com   # the Workspace domain(s); defaults to the line above
   # frontend (inlined at build time)
   NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID=<the same client id>
   ```
   Unset `AUTH_MODE` (the dev placeholder) if it was set.
4. Verify: `modes.auth` is `"required"`; the app opens on the sign-in screen with
   Google's button; after signing in, a reload stays signed in (the session cookie);
   `npm run smoke -- <url> --cookie <value>` passes **session**; Firestore has a
   `users` document and an `identity_links` document for the account.

**Verify on first use:** Google's token check is covered by tests only with Google
stubbed; the first real sign-in is its first real run.

## Sessions: signed tokens or server sessions

`SESSION_MODE` picks how a signed-in browser stays signed in (#489):

| `SESSION_MODE` | The cookie holds | Sign-out | Disable an account |
|---|---|---|---|
| `jwt` (default) | a signed 30-day token (`SESSION_SECRET`) | clears the cookie; a copy works until it expires | only stops new Google sign-ins |
| `opaque` | a random 256-bit ID; the server keeps its SHA-256 hash in `login_sessions` | revokes the server record: a copy is refused | refuses every session at once |

With `opaque`, every request checks the session's idle deadline
(`SESSION_IDLE_SECONDS`, default 7 days; renewed with use, at most hourly), its
absolute deadline (`SESSION_ABSOLUTE_SECONDS`, default 30 days; never extended),
revocation and the owner's status. A Google ID token is accepted only on sign-in;
after that the cookie is the only credential. `SESSION_SECRET` isn't needed.

1. Turn on a TTL policy so old records are cleaned up (expiry is still checked on
   every read; the TTL only deletes):
   ```bash
   gcloud firestore fields ttls update expireAt --collection-group=login_sessions --enable-ttl
   ```
2. Set `SESSION_MODE=opaque` and restart. **Everyone is signed out once**: old
   cookies hold tokens, not session IDs.
3. Verify: `modes.sessions` is `"opaque"`; after signing in, `login_sessions` has
   a document named by a 64-character hash; signing out and replaying the old
   cookie gets `401`.

A resolved session is reused for up to 10 s per backend instance. Sign-out and
disabling take effect at once on the instance that did them, and within 10 s on
the others. Disabling an account is a trusted server function
(`sessions().disableOwner(ownerKey)` in `backend/src/lib/sessions/`); there is no
route for it.

## AI generation: the placeholders

Without `VERTEX_PROJECT_ID`, images are gradients the backend draws at the
requested aspect ratio (a new tint per variant), stored and sent on as references
like real outputs; text and video answer canned placeholders. No network is used.

## AI generation: Vertex AI

1. Enable the Vertex AI API in the project, and give the backend's identity
   `roles/aiplatform.user` (deployment.md, **Vertex AI setup**).
2. Set, and restart: `VERTEX_PROJECT_ID=<project>` (`VERTEX_LOCATION` defaults to
   `global`, which the Nano Banana models need).
3. Verify: `modes.ai` is `"vertex"`; `npm run smoke -- <url> --generate` reports the
   model rather than `placeholder` (billed: one image).

**Verify on first use:** real generation is billed and has not run in CI.

## Video jobs: Cloud Tasks

In process, a video runs in the backend that queued it, after the request has
answered; on local disk, a job a restart interrupted runs again at startup. On
Cloud Run each job is a Cloud Task instead, which calls the backend's worker
endpoint (`POST /internal/jobs/:id/run`, outside `/api`, so the proxy never
reaches it) on whichever instance it lands, retrying if the call fails.

1. Create the queue, and a service account for the tasks:
   ```bash
   gcloud services enable cloudtasks.googleapis.com
   gcloud tasks queues create gcos-video --location=$REGION \
     --max-attempts=3 --max-concurrent-dispatches=10
   gcloud iam service-accounts create gcos-tasks
   TASKS=gcos-tasks@$PROJECT.iam.gserviceaccount.com
   ```
2. Roles: the **backend** enqueues and mints tokens as the tasks account; the
   **tasks** account may invoke the backend, and nothing else.
   ```bash
   gcloud tasks queues add-iam-policy-binding gcos-video --location=$REGION \
     --member=serviceAccount:$SA --role=roles/cloudtasks.enqueuer
   gcloud iam service-accounts add-iam-policy-binding $TASKS \
     --member=serviceAccount:$SA --role=roles/iam.serviceAccountUser
   gcloud run services add-iam-policy-binding gcos-backend --region=$REGION \
     --member=serviceAccount:$TASKS --role=roles/run.invoker
   ```
3. Set, and deploy with a request timeout that outlasts a video
   (`--timeout=1800`: Veo is polled for up to 15 minutes):
   ```bash
   CLOUD_TASKS_QUEUE=projects/$PROJECT/locations/$REGION/queues/gcos-video
   CLOUD_TASKS_SERVICE_ACCOUNT=$TASKS
   JOBS_WORKER_URL=https://<the backend's run.app URL>
   ```
4. Verify: `modes.jobs` is `"cloud-tasks"`; a video started in the app finishes,
   and the queue's console shows its task.

**Verify on first use:** the worker's token check is tested with Google's
verification stubbed, and enqueuing with the REST call stubbed.

## Support email: SMTP

The support form (`POST /api/support`, open to anyone, signed in or not) keeps
every message in the data store (`support/{id}` in Firestore, `.data/support/` on
local disk) before anything else. Without SMTP that is all, plus a log line; with
it, each message is then emailed to the team, with Reply-To set to the sender.
An email that fails leaves the message kept and the failure logged.

1. Pick an SMTP server: Google Workspace's SMTP relay, SendGrid, Mailgun or any
   other. Port 587 uses STARTTLS; 465 uses TLS from the start.
2. Keep the password in Secret Manager and give it to the service as `SMTP_PASS`:
   ```bash
   printf '%s' "<smtp password>" | gcloud secrets create gcos-smtp-pass --data-file=-
   gcloud secrets add-iam-policy-binding gcos-smtp-pass \
     --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor
   gcloud run services update gcos-backend --region=$REGION \
     --update-secrets=SMTP_PASS=gcos-smtp-pass:latest
   ```
3. Set the rest (`SUPPORT_EMAIL_TO` takes several addresses, comma-separated;
   leave `SMTP_USER` and `SMTP_PASS` unset for a relay that trusts the backend's
   address):
   ```bash
   SUPPORT_EMAIL_TO=support@yourteam.com
   SUPPORT_EMAIL_FROM=no-reply@yourteam.com
   SMTP_HOST=smtp.example.com
   SMTP_PORT=587
   SMTP_USER=<smtp user>
   ```
4. Verify: `modes.supportEmail` is `"smtp"`; a message sent from the sign-in
   screen's **Contact us** arrives, and Reply answers the sender.

Each address may send 5 messages an hour, counted per backend instance.

## FastAPI: the private Python service

Skills (create, list, publish, the catalog check, the AI draft helper) and job
creation are calls from this backend to a separate FastAPI service (#494). All of
them go through one client, `backend/src/lib/fastapi/`. Without `FASTAPI_BASE_URL`
the client is a placeholder that answers from memory and checks nothing; a
deployed backend refuses it the first time something calls FastAPI (nothing does
yet, so a deployment without the service still starts, with a warning).

Each call carries the backend's own Google-signed ID token (Application Default
Credentials: the backend's service account on Cloud Run), never a user's token or
cookie, and the signed-in owner's key (`usr_…`) in an `X-Owner-Key` header. The
Skills calls follow the service in `docs/aryash/GCOS-FastAPI-skills-main` (`/v1/…`
routes, `Idempotency-Key` on publish); they're listed in `OPERATIONS` in
`backend/src/lib/fastapi/types.ts`. Creating a job is still a proposal: that
service has no jobs.

1. Deploy FastAPI as its own Cloud Run service, private
   (`--no-allow-unauthenticated`).
2. Let the backend's service account call it:
   ```bash
   gcloud run services add-iam-policy-binding <fastapi-service> --region=$REGION \
     --member=serviceAccount:$SA --role=roles/run.invoker
   ```
3. **FastAPI must check the caller itself**: a Google-signed ID token whose
   audience is its own URL (or the custom audience) and whose email is the
   backend's service account. The service does this in `app/security.py`; set its
   `FASTAPI_AUDIENCE` to its own URL and `NODE_SERVICE_ACCOUNT` to `$SA`. Without
   that check this client is not secure on its own, because `X-Owner-Key` would
   be trusted from anyone.
4. Set, and restart:
   ```bash
   FASTAPI_BASE_URL=https://<fastapi service>.run.app
   # FASTAPI_AUDIENCE=<custom audience>   # only if FastAPI expects one other than its URL
   ```
5. Verify: `modes.fastapi` is `"service"`.

Timeouts (`FASTAPI_JOB_TIMEOUT_MS` 15 s, `FASTAPI_SKILLS_TIMEOUT_MS` 10 s,
`FASTAPI_HELPER_TIMEOUT_MS` 30 s) are placeholders until agreed with #363. Only
calls that are safe to repeat are retried, once. Creating a job is never retried:
if its answer is lost, the client reports it as pending so it can be reconciled
by its idempotency key, rather than risk starting a second job.

**Verify on first use:** the client is tested with the token and HTTP stubbed;
no real FastAPI service exists yet.

## Runs: idempotency and the Playspace lock

`POST /api/runs` (#491, #492) admits one Run click: an `Idempotency-Key` header
plus the Run request. It is verified (#493), then three records are written in
one Firestore transaction, before anything is sent to FastAPI:

| Collection | Holds |
|---|---|
| `idempotency/{ownerKey}:{key}` | the click's fingerprint, its job ID, `pending` / `accepted` / `failed`, `expireAt` |
| `owners/{ownerKey}/playspaces/{playspaceId}` | `inFlightJobId`: the one job holding the Playspace (no TTL) |
| `runs/{jobId}` | the job's Playspace, node, mode and state, for lineage |

The same click returns the same job; the same key with a changed Run is `409
idempotency_conflict`; another click on a busy Playspace is `409 playspace_busy`.
The job ID comes from owner + key, so a lost FastAPI answer leaves the click
`pending` under the same ID; it is never sent again under a new one. Runs need
an owner key: Google sign-in, or dev sign-in with `SESSION_MODE=opaque`.

1. Turn on a TTL policy for old click records (expiry is checked on read too;
   the TTL only deletes): `gcloud firestore fields ttls update expireAt
   --collection-group=idempotency --enable-ttl`. Never on `playspaces`: a lock
   is released only when its job finishes.
2. Until a worker or reconciler calls the release handoff (`runs().finishRun`),
   a lock whose job is gone is cleared with
   `npm run release-run-lock -- <ownerKey> <playspaceId> <jobId>` (it does
   nothing unless that job holds the lock). A lock held past
   `RUN_LOCK_STALE_SECONDS` is logged.

## Checking everything at once: the smoke test

One command checks any backend and prints a line per service; it exits non-zero
if anything failed, and removes what it created.

```bash
cd backend
npm run smoke -- http://localhost:4000            # placeholders: signs in by itself in dev mode
npm run smoke -- https://<backend-url> --cookie <gcos_session value> --origin https://<frontend-url> [--generate]
```

```
Smoke test: http://localhost:4000
  ✓ health        sign-in=dev storage=local/local ai=placeholder
  ✓ sign-in mode  dev
  ✓ session       signed in as dev.user@accenture.com
  ✓ assets        upload, download (byte-identical), delete; durable=true
  ✓ boards        create, list, delete
  – generate      pass --generate (billed on Vertex AI)
All checks passed.
```

- **With Google sign-in**, sign in in the browser, then copy the `gcos_session`
  cookie's value from DevTools → Application → Cookies (it is HttpOnly, so scripts
  cannot read it) and pass it as `--cookie`. Without it, the checks that need a
  session are skipped and say so.
- **`--generate`** runs one image generation: free on the placeholders, billed on
  Vertex AI.
- **A Cloud Run backend that admits only authenticated callers** also needs
  `--infra-token "$(gcloud auth print-identity-token)"`.
- CI runs it against its own backend on every PR.

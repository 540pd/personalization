# GCOS Personalization

A generation-first canvas inspired by Luma AI. Users work on an infinite Konva canvas, trigger AI
image generation through a floating dock, and manage assets and skills in a right-side panel. Each
canvas node connects to others via ports and wires — generation flows graph-aware through the board.

```
gcos-personalization/
├── frontend/    Next.js 15 App Router — Konva canvas, floating dock, right panel, minimap
├── backend/     Express 4 + TypeScript ESM — image generation, board state, auth
├── docs/        Deployment guide, model guide, feature specs, Luma UI reference
└── screenshots/ Reference captures of toolbar, nodes, minimap
```

## Run it locally

### Prerequisites

- **Node 20+** (`node -v` to check; the project's `engines` field enforces this)
- Each package has its own `package.json` — there is no root `npm install` for the app packages

### Two terminals

**1. Backend.** It runs with no keys at all: every GCP service has a placeholder (local disk
storage, offline AI images, in-process video jobs), and it prints which is which at startup.

```bash
cd backend
npm install
echo "AUTH_MODE=dev" > .env   # dev sign-in: type any allowed email. Omit for anonymous.
npm run dev
```

Runs on `http://localhost:4000`. Health check, with each service's mode:
`curl http://localhost:4000/api/health`. Moving a service to GCP is env only; see
[`docs/switching-to-gcp.md`](docs/switching-to-gcp.md).

**2. Frontend:**

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. The app asks the backend how sign-in works (`GET /api/auth-config`):
anonymous opens the board directly; dev sign-in shows an email field; Google shows Google's
button (`NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` in `frontend/.env.local`). See `frontend/src/auth/`.

The canvas never calls the backend directly — it goes through
`frontend/src/app/api/proxy/[...path]/route.ts`, which defaults to `http://localhost:4000`. Set
`BACKEND_URL` in `.env.local` to point elsewhere.

### Running tests / typecheck

```bash
cd backend  && npm test && npx tsc --noEmit
cd backend  && npm run test:emulators        # the stores on Firestore/Storage emulators (Java 21)
cd backend  && npm run smoke -- http://localhost:4000
cd frontend && npm test && npm run lint && npx tsc --noEmit
cd frontend && npx playwright test           # e2e; one worker
```

## Auth

Two-layer: a Google ID token (short-lived, **in-memory only**) + a session in an `HttpOnly` cookie.
By default (`SESSION_MODE=jwt`) that is a 30-day JWT signed with `SESSION_SECRET`; with
`SESSION_MODE=opaque` it is a random session ID checked against `login_sessions` on every request,
revoked on sign-out and when an account is disabled (#489, `docs/switching-to-gcp.md`).

- The Google ID token lives **in `authState.ts` as a module variable** — never `localStorage`,
  `sessionStorage`, or a cookie.
- **All API calls from the frontend go through `/api/proxy`** — never a direct `fetch` to the
  backend URL. Locally the proxy forwards the request; on Cloud Run it also mints a service-to-
  service OIDC token so the backend (deployed `--no-allow-unauthenticated`) will accept it.
- `requireIdentity` middleware on the backend gates all routes except `/api/health` and
  `/api/auth-config`.
- CSRF: a POST, PUT, PATCH or DELETE that carries the session cookie, and every sign-in or
  sign-out, must come from an origin in `ALLOWED_ORIGINS` (exact scheme, host and port). The proxy
  forwards the browser's `Origin`; anything else gets `403 origin_not_allowed`.
- Google sign-in needs a verified email and a Workspace account whose domain (the token's `hd`) is in
  `ALLOWED_HOSTED_DOMAINS` (defaults to `ALLOWED_EMAIL_DOMAINS`, e.g. `accenture.com`); the email domain is
  checked as well, never instead. Enforced server-side.

## Wiring up real generation

Set `VERTEX_PROJECT_ID` in `backend/.env` and authenticate via Application Default Credentials:

```bash
gcloud auth application-default login
```

Then add to `backend/.env`:

```bash
VERTEX_PROJECT_ID=your-gcp-project-id
VERTEX_LOCATION=global          # Nano Banana models require global (this is the default)
```

Without `VERTEX_PROJECT_ID`, `POST /api/generate/image` returns a placeholder — no crash, no
error. With it, every Generate click is a real, billed Vertex AI call.

### Available models

Defined in `frontend/src/app/canvas/components/NodePanel/kinds/imageKind.tsx` (`MODELS`):

| Display name | Vertex AI model ID |
|---|---|
| Nano Banana 2 | `gemini-3.1-flash-image` |
| Nano Banana 2 Lite | `gemini-3.1-flash-lite-image` |
| Nano Banana Pro | `gemini-3-pro-image` |

Adding or removing a model is a two-file change — see [`docs/adding-image-models.md`](docs/adding-image-models.md).

## Where data goes

Boards, stored files (uploads and generated images and videos) and video jobs each go to
memory, local disk (`backend/.data`, the default for `npm run dev`), the local emulators, or GCP
(Firestore + Cloud Storage), picked from env alone. Files are always served through the proxy
(`/api/proxy/assets/<id>/content`), so the bucket is never exposed to the browser. See
[`docs/deployment.md`](docs/deployment.md) ("Where data goes") and
[`docs/switching-to-gcp.md`](docs/switching-to-gcp.md).

## Docs

- [`docs/handover/`](docs/handover/README.md) — **start here if you are picking this up**: the
  state of the work, the PR stack and how to merge it, what is open
- [`docs/switching-to-gcp.md`](docs/switching-to-gcp.md) — moving each service from its placeholder
  to GCP, with the roles and how to verify
- [`docs/deployment.md`](docs/deployment.md) — Cloud Run deploy commands, IAM, Firestore setup,
  Secret Manager provisioning
- [`docs/adding-image-models.md`](docs/adding-image-models.md) — how to add/remove Vertex AI
  models in the picker
- [`docs/specs/`](docs/specs/) — per-feature specs (auth design, canvas features)
- [`docs/luma-reference/`](docs/luma-reference/) — Luma AI UI/UX screen reference (BOARD-01,
  TOOL-01, IMG-01/02/03, etc.) used to spec canvas features

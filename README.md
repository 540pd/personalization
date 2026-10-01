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

**1. Backend** (defaults to mock placeholder images if `VERTEX_PROJECT_ID` isn't set):

```bash
cd backend
cp .env.example .env        # then fill in at minimum: GOOGLE_OAUTH_CLIENT_ID, SESSION_SECRET
npm install
npm run dev
```

Runs on `http://localhost:4000`. Health check: `curl http://localhost:4000/api/health`

For anonymous local dev without OAuth, add `AUTH_MODE=anonymous` to `backend/.env` — every
request is attributed to a shared `"anonymous"` identity, no sign-in required.

**2. Frontend:**

```bash
cd frontend
cp .env.local.example .env.local    # set NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID to match backend
npm install
npm run dev
```

Open `http://localhost:3000`. A Google sign-in card blocks the canvas until auth succeeds — see
`AuthGate.tsx`. If the backend is running with `AUTH_MODE=anonymous`, `AuthProvider.tsx` detects
this via `GET /api/auth-config` and skips the sign-in wall without any frontend env var needed.

The canvas never calls the backend directly — it goes through
`frontend/src/app/api/proxy/[...path]/route.ts`, which defaults to `http://localhost:4000`. Set
`BACKEND_URL` in `.env.local` to point elsewhere.

### Running tests / typecheck

```bash
cd backend  && npm test && npx tsc --noEmit
cd frontend && npm test && npm run lint && npx tsc --noEmit
```

## Auth

Two-layer: a Google ID token (short-lived, **in-memory only**) + a 30-day session JWT (`HttpOnly`
cookie, signed with `SESSION_SECRET`).

- The Google ID token lives **in `authState.ts` as a module variable** — never `localStorage`,
  `sessionStorage`, or a cookie.
- **All API calls from the frontend go through `/api/proxy`** — never a direct `fetch` to the
  backend URL. Locally the proxy forwards the request; on Cloud Run it also mints a service-to-
  service OIDC token so the backend (deployed `--no-allow-unauthenticated`) will accept it.
- `requireIdentity` middleware on the backend gates all routes except `/api/health` and
  `/api/auth-config`.
- Allowed email domains are enforced server-side via `ALLOWED_EMAIL_DOMAINS` (e.g. `accenture.com`).

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

Defined in `frontend/src/components/canvas/NodePanel.tsx` (`MODELS` constant at the top):

| Display name | Vertex AI model ID |
|---|---|
| Nano Banana 2 | `gemini-3.1-flash-image` |
| Nano Banana 2 Lite | `gemini-3.1-flash-lite-image` |
| Nano Banana Pro | `gemini-3-pro-image` |

Adding or removing a model is a two-file change — see [`docs/adding-image-models.md`](docs/adding-image-models.md).

## Board persistence: local disk vs. Firestore

`backend/src/lib/boardStore.ts` saves each user's board state. Mode is a single env var:

```bash
# unset (default) — local disk; board saved under backend/board-store/
FIRESTORE_PROJECT_ID=

# set — reads/writes Firestore via Application Default Credentials
FIRESTORE_PROJECT_ID=your-gcp-project-id
```

## Asset storage: local disk vs. GCS

Generated images are persisted once at the route boundary so they survive past the response.

```bash
# unset (default) — local disk under backend/generated-images/
GCS_BUCKET_NAME=

# set — uploads to that GCS bucket via Application Default Credentials
GCS_BUCKET_NAME=your-bucket-name
```

In both modes the returned URL shape is identical (`/api/proxy/images/<filename>`) — the bucket
is never exposed to the browser.

## Docs

- [`docs/deployment.md`](docs/deployment.md) — Cloud Run deploy commands, IAM, Firestore setup,
  Secret Manager provisioning
- [`docs/adding-image-models.md`](docs/adding-image-models.md) — how to add/remove Vertex AI
  models in the picker
- [`docs/specs/`](docs/specs/) — per-feature specs (auth design, canvas features)
- [`docs/luma-reference/`](docs/luma-reference/) — Luma AI UI/UX screen reference (BOARD-01,
  TOOL-01, IMG-01/02/03, etc.) used to spec canvas features

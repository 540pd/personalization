# Handover: GCOS Personalization

A handover of the work on this repo, as of **2026-10-22**, for the team taking it over.
The release **`handover-2026-10-22`** is this exact state, as a zip.

- **[index.md](index.md)**: every PR, in merge order, with its branch and issue, and every open issue.
- **[../switching-to-gcp.md](../switching-to-gcp.md)**: moving each service from its placeholder to GCP.
- **[../deployment.md](../deployment.md)**: Cloud Run, staging project, emulators.

## The state at a glance

| | |
|---|---|
| **Pull requests** | **74 open, none merged.** They form one stack: each PR's base is the PR before it. `main` has none of this work yet. |
| **CI** | Green on #319 (which brought CI to every PR) and on every PR above it: frontend (typecheck, lint, unit), backend (typecheck, unit), backend on the Firestore/Storage emulators, the e2e suite in 4 shards, and the smoke test. The PRs below #319 never had a CI run, since the old workflow ran only for PRs into `main` (#200 did, and passed). They were verified locally (the last full e2e run there: 546 / 546 at #310), and their code is in every CI run above them. |
| **Tests** | Frontend unit 930 · backend 209, plus 19 that run only on the emulators · e2e 524 tests in 57 specs (Playwright). |
| **GCP** | Nobody has had GCP access or a Google OAuth client. Every GCP service has a **placeholder**, so the whole app runs locally with no keys. Switching is env-only (below). |
| **Issues** | 74 open. Each has a spec (screen IDs, acceptance criteria, UI states, out of scope, definition of done), and most are implemented by a PR in the stack. |

## Run it in five minutes, with no keys

```bash
# backend: http://localhost:4000
cd backend && npm install
echo "AUTH_MODE=dev" > .env        # dev sign-in: type any accenture.com email
npm run dev

# frontend: http://localhost:3000 (another terminal)
cd frontend && npm install && npm run dev
```

The backend prints what each service runs on, and the variable that would switch it:

```
  sign-in: dev sign-in (placeholder; sessions end on restart, no SESSION_SECRET) -- to switch: GOOGLE_OAUTH_CLIENT_ID, SESSION_SECRET, unset AUTH_MODE
  storage: local disk at …/backend/.data (placeholder) -- to switch: FIRESTORE_PROJECT_ID, GCS_BUCKET_NAME
  AI:      offline placeholders -- to switch: VERTEX_PROJECT_ID
  jobs:    in process (placeholder) -- to switch: CLOUD_TASKS_QUEUE, CLOUD_TASKS_SERVICE_ACCOUNT, JOBS_WORKER_URL
```

Without `AUTH_MODE`, the backend runs anonymously: no sign-in, and the board stays in the browser only.
`npm run smoke -- http://localhost:4000` (backend) checks every service in one go.

> The checked-out `main` doesn't have this work. Check out the top of the stack,
> `feat/cloud-tasks` (or `docs/handover` for this document), or unzip the release.

## What was built

In stack order. Each group is a run of PRs; [index.md](index.md) lists every one.

### Canvas features: `canvas`, 24 PRs
The Luma-inspired board itself, spec by spec:
- the Playspace menu: Clear, **Save to file** and **Open file**;
- the whole board kept across reloads;
- **Skills** and **Agents** pages, with upload, edit, remove with Undo, and duplicate;
- **Settings**: connection style, always-show names;
- Brand as a page;
- **Frames**: create from a selection, remove keeping contents, a style bar, and **auto layout** (reorder, stacks, resize, room for names);
- `@` mentions of skills and agents in Prompt, Image and Video panels;
- handles that can't hold spaces.

### Refactor rounds 1–3: `r1`, `r2`, `r3`, 27 PRs (#247, #280, #311)
"Production-grade, modular, short files, shared code":
- dead code removed;
- one keyboard guard;
- one pointer-drag helper;
- typed canvas events;
- Board and NodePanel split into modules;
- shared storage, frame-geometry, style and selection helpers;
- one tooltip component;
- one name cleaner for prompts;
- the API proxy hardened (errors, timeouts, binary bodies, path checks, aborts);
- the last multi-job files split.

No behaviour change except fixes, each called out in its PR.

### Small groups: `sel`, `tip`, `names`, `fixes`, `ci`
- **One shared selection slice** across nodes, wires, Frames and panels; undo no longer restores selection.
- **Tooltips:** both looks share one component, and every dock button has an accessible name.
- **The name cleaner:** one function cleans every name a prompt mentions.
- **Fixes:** a Mac-safe select-all in the specs, the Upload shortcut label, and the lockfile.
- **CI on every PR** (it used to run only for PRs into `main`), plus the e2e suite.

### The backend plan: `plan`, 15 PRs (#327)
Accounts, persistence and GCP, with placeholders while there's no access:

| Issue | What | PRs |
|---|---|---|
| #320 | The 30-day HttpOnly session cookie actually used (nothing read it before), the proxy forwarding only it, sign-out | #328 |
| #321 | **Sign in with Google**: the sign-in screen, session restore on reload, a session-ended banner. It was a TODO, and the gate wasn't mounted | #329 |
| #322 | Storage modes (memory / local disk / emulator / GCP), Firebase emulators for local dev and CI, a staging recipe | #330 |
| #323 | Images and videos as **stored assets** (Cloud Storage + Firestore) served through the proxy, instead of `data:` URLs in the board | #331, #332, #337 |
| #333 | Placeholder: **local disk storage** under `backend/.data` | #338 |
| #334 | Placeholder: **dev sign-in** (`AUTH_MODE=dev`) instead of Google | #339 |
| #335 | Placeholder: **offline AI images** at the requested shape | #340 |
| #336 | **Smoke test**: `npm run smoke -- <url>` | #341 |
| #324 | **The board saved to the account**: by revision, with a conflict banner across tabs, offline retry, and a one-time import with its pictures moved into assets | #342, #343, #344 |
| #325 | **Video jobs that survive restarts**: a durable job store, the in-process placeholder, and **Cloud Tasks** with a token-checked worker endpoint | #345, #346 |

## Architecture, in one screen

```
browser ──► frontend (Next.js 15) ──► /api/proxy/[...path] ──► backend (Express, ESM)
            Konva canvas, panels,      the only way to the        routes → services → lib stores
            Zustand stores             backend; adds Cloud Run     (memory | local | emulator | GCP)
                                       OIDC when deployed
```

- **Frontend** (`frontend/src`):
  - `app/canvas/board/`: the stage, saving and loading, account sync (`boardSync.ts`), uploads;
  - `app/canvas/components/`: the UI;
  - `store/`: Zustand;
  - `auth/`: the sign-in lifecycle.
- **Backend** (`backend/src`):
  - `routes/`, then `services/`, then `lib/` stores;
  - every store is one interface with memory, local-disk and Firestore (and Cloud Storage) versions, picked by `lib/storageMode.ts`, plus one contract test for all of them;
  - `capabilities/`: the Vertex AI calls and their mocks.
- **What's running:** `lib/serviceModes.ts` builds the startup summary and `/api/health`'s `modes`, and refuses a deployed start on any placeholder except AI.
- **The rules this code keeps:** [`CLAUDE.md`](../../CLAUDE.md) (memory-only ID token, all calls through the proxy, mock mode on missing keys, `createApp()`, ESM `.js` imports, no Zod).

## Moving to GCP

All env, no code. The full checklist per service, with roles and how to verify, is
[switching-to-gcp.md](../switching-to-gcp.md). In short:

| Service | Set |
|---|---|
| Sign-in | `GOOGLE_OAUTH_CLIENT_ID`, `SESSION_SECRET` (frontend: `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID`); unset `AUTH_MODE` |
| Data and files | `FIRESTORE_PROJECT_ID`, `GCS_BUCKET_NAME` |
| AI | `VERTEX_PROJECT_ID` |
| Video jobs | `CLOUD_TASKS_QUEUE`, `CLOUD_TASKS_SERVICE_ACCOUNT`, `JOBS_WORKER_URL` |

Then `npm run smoke -- <url> [--cookie …] [--generate]`. A deployed backend refuses to
start on a storage, sign-in or jobs placeholder, so a missed variable fails loudly.

**Never run against real GCP yet. Verify on first use:**
- Google's token check (tested with Google stubbed);
- the exact IAM roles;
- real Vertex AI generation;
- Cloud Tasks enqueueing and its worker's token check.

The Firestore and Storage code paths do run in CI, against the emulators.

## Reviewing and merging the stack

- **CI first.** `main`'s workflow still runs only for PRs into `main`, and the one that runs on every PR (`.github/workflows/ci.yml`) arrives with #319, 59th in the stack. Put that file on `main` first (a one-file PR from #319's branch) so every PR gets checks as it's retargeted to `main`.
- **Bottom up.** Merge #200 into `main` first, then each next PR in [index.md](index.md) order.
- **Turn on "Automatically delete head branches"** in the repo settings. Then, when a PR merges and its branch goes, GitHub retargets the next PR to `main`. Otherwise, retarget each by hand (`gh pr edit <n> --base main`).
- **Closing issues:** GitHub acts on `Closes #N` only in PRs into the default branch, so a PR's issue closes when it merges **after** being retargeted to `main`. 69 of the 74 PR bodies carry it. The other five are the earlier parts of split issues (#331, #332 for #323; #342, #343 for #324; #345 for #325), and the last part of each closes it. index.md's **Issue** column says which issue each PR implements.
- **Squash or merge commits:** either works. Each PR is one or a few commits with full messages.
- **Rebasing:** while nothing is merged, a change low in the stack means rebasing the PRs above it. `git rebase --update-refs` moves a whole chain at once.
- **Titles:** they carry `[group k/n]` and a generated Stack section in each body. `python3 docs/handover/tools/stack_titles.py --apply` keeps them in step after adding a PR. `docs/handover/tools/handover_index.py` regenerates index.md.

## Testing

| What | How | Notes |
|---|---|---|
| Unit | `npm test` in each package | Vitest; the backend's store contracts run against memory and local disk |
| Emulators | `npm run test:emulators` (backend) | Needs **Java 21**; CI runs it on every PR |
| e2e | `npx playwright test` (frontend) | One worker: Konva drags are timing-sensitive. `E2E_BASE_URL` points it at a running dev server, so several worktrees can test at once. About 17 min in CI across 4 shards |
| Smoke | `npm run smoke -- <backend-url>` (backend) | Checks every service; CI runs it on shard 1 |

Locally, an e2e run needs a backend from **the same branch** (`BACKEND_URL` for the
frontend's dev server). An older backend lacks newer routes, and the specs that fail
on console errors will flag its 404s.

## How the work was done

- **Spec first.** Every feature began as an issue from `.github/ISSUE_TEMPLATE/canvas-feature.md`, and issues were updated when scope moved during implementation (look for "*Added while implementing*").
- **One feature per issue, one concern per PR.** Large issues split into stacked PRs (assets: 3, boards: 3, jobs: 2).
- **Commits:** full messages saying why. Work was AI-assisted (Claude Code), credited in each commit's `Co-Authored-By` line and each PR's footer.
- **Tooling for assistants:** `.claude/agents` (designer, developer, tester) and `.claude/skills` (canvas-frontend, backend-api). `canvas-frontend.md` predates the refactor in places; check it against the code.

## Open, and not planned yet

**Open**
- **#326, production setup:** service accounts, Secret Manager, Cloud Run settings, a staging deploy. Much of it is already in `switching-to-gcp.md` and the startup refusals; the rest needs GCP access.

**Not planned yet**
- More than one board per user, and BOARD-02 switching.
- The Assets panel (ASSET-01/02). The rail item is disabled; the list and delete routes are ready for it.
- Generation history.
- Skills, agents and settings saved to the account; they're still localStorage.
- **Save to file** embedding asset images: a file now holds asset URLs, which only their owner can load.
- Copying local-disk data into GCP.
- A deploy pipeline.

**Known minor items**
- One existing lint warning: a `useLayoutEffect` without deps in `ShapeStyleBar.tsx`.
- The emulators need Java locally.

## The release

**`handover-2026-10-22`**, a pre-release tagged on this PR's head commit, which is the top of
the stack. It holds:
- GitHub's own source archives (zip and tar.gz) of that commit;
- **`gcos-personalization-handover-2026-10-22.zip`**: the same tree (tracked files only: no `node_modules`, no `.env` files, no local data) with this handover at its root as `HANDOVER.md`.

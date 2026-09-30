# GCOS Personalization — Claude Code Guidance

## What this repo is

A generation-first canvas (playboard) inspired by Luma AI. Users work on an infinite Konva canvas,
use a floating dock to trigger AI image generation, and manage assets and skills in a right-side panel.

Two packages:
- `frontend/` — Next.js 15 App Router → Cloud Run. Konva canvas, floating dock, right panel.
- `backend/` — Express 4 + TypeScript ESM → Cloud Run. Image generation, board state, auth.

## Spec-driven development

Every feature starts as a GitHub Issue using `.github/ISSUE_TEMPLATE/canvas-feature.md`. Before
implementing anything, confirm the issue exists and has:
- **Screen IDs** referencing `docs/luma-reference/Luma_UI_UX_Screen.docx` (e.g. BOARD-01, TOOL-01)
- **Acceptance criteria** — numbered, each independently verifiable
- **UI states** — every visual state that must be manually tested
- **Out of scope** — what is explicitly not in this issue
- **Definition of done** checklist

Never start implementing a feature without a spec. Never put two features in one issue.

## Auth

Two-layer: Google ID token (short-lived) + app session JWT (30-day, HttpOnly cookie).

- The Google ID token lives **in memory only** — never written to localStorage, sessionStorage, or a cookie.
- All API calls from the frontend go through `/api/proxy/[...path]` — never directly to the backend.
- The proxy handles Cloud Run service-to-service OIDC tokens (infra) vs user identity tokens (app).
- `requireIdentity` middleware on the backend gates all routes except `/api/health` and `/api/auth-config`.

## Key non-negotiables

1. **Memory-only ID token** — `authState.ts` holds the token in a module variable. No localStorage writes.
2. **All API calls via `/api/proxy`** — never `fetch("http://backend...")` from a client component.
3. **Mock mode on missing keys** — `VERTEX_PROJECT_ID` absent → return placeholder, never crash.
4. **`createApp()` factory in backend** — `server.ts` exports `createApp()` and only binds a port when run directly. This is what makes `supertest`-based tests work.
5. **ESM imports in backend** — all imports use `.js` extension even though files are `.ts`.
6. **No Zod** — validate request bodies inline with `typeof` / array checks.

## Definition of done

Every issue must satisfy before closing:
- [ ] `cd frontend && npx tsc --noEmit` — 0 new errors
- [ ] `cd backend && npx tsc --noEmit` — 0 new errors
- [ ] `git diff --name-only` shows only in-scope files
- [ ] All UI states from the issue verified manually
- [ ] No console errors in browser DevTools
- [ ] Canvas features tested at 50%, 100%, 150% zoom

## Luma reference

The Luma AI UI/UX reference is at `docs/luma-reference/Luma_UI_UX_Screen.docx`. Screen IDs used
in issue specs:

| ID | Surface |
|---|---|
| ONB-01/02/03 | Onboarding flow |
| BOARD-01 | Main board workspace shell |
| BOARD-02 | Board/page navigation dropdown |
| TOOL-01 | Floating creation dock |
| IMG-01 | Image model picker |
| IMG-02/03 | Create Image panel (basic / advanced) |
| OBJ-01 | Canvas object selected |
| CHAT-01 | Chat panel |
| ASSET-01/02 | Assets panel |
| SKILL-01 | Skills panel |
| UTIL-01 | Zoom / viewport controls |

## Skills

Load the relevant skill before touching code:
- Canvas/panels/shapes work → `.claude/skills/canvas-frontend.md`
- Backend routes/capabilities/middleware → `.claude/skills/backend-api.md`

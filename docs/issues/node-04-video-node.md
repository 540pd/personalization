---
name: node > video — a video node backed by Gemini
labels: enhancement, area:canvas, area:panels, area:backend
---

Blocked by: `node-03`, and **#7 (async job queue)** — see the blocker section, which is the
whole reason this is last.

## Screen IDs
TOOL-01 (dock entry exists already), BOARD-01, OBJ-01, IMG-02 (panel pattern).

## The blocker, stated first

**Video generation cannot use the current synchronous request path.**

`POST /api/generate/image` does the work inline and returns `status: "done"` in the same
response. `routes/generate.ts` already carries the acknowledgement:

```ts
// TODO: replace with async job queue (Cloud Tasks) for long-running generations.
```

The response shape has a `jobId` field that is generated and then never used, so the design
anticipated this and the implementation did not. Video generation runs for minutes; a Cloud Run
request will time out well before it returns. **Issue #7 is a hard prerequisite, not a nice-to-have.**

Minimum viable async path for this issue:
- `POST /api/generate/video` returns `{ jobId, status: "pending" }` immediately
- `GET /api/generate/:jobId` returns `pending` / `done` / `failed` with a result or an error
- the node polls, with backoff, and survives a page reload (the job id is stored on the node)

Agree that contract before any frontend work — it is the part that cannot be retrofitted.

## Acceptance criteria

### Frontend
1. `NODE_KINDS.video` added. The dock's `generate-video` item creates one.
2. The node renders a `<video>` in the placeholder with controls, respecting the node's corner
   radius like the image preview does (`border-radius: inherit`).
3. Advanced fields are video's own (duration, resolution) — no aspect-ratio-driven resize unless
   the model actually constrains it.
4. **Pending state is a first-class UI state**, not a spinner that blocks the canvas: the node
   shows progress, the rest of the board stays usable, and the user can select, move, delete and
   undo while a generation runs.
5. Reloading the page while a job is pending resumes polling rather than losing the job.
6. A failed or cancelled job leaves the node in a recoverable state with a visible reason.
7. Deleting a node with a job in flight stops its polling — no leaked timers, no writes to a
   store entry that no longer exists.
8. Everything shared still works with no kind-specific code: drag, resize, selection takeover,
   ports, occlusion, raise-on-drag, label, rename, connections.

### Backend
9. Video capability + the async routes above, reusing the shared `buildContentParts` and the
   shared request validator from `node-03`.
10. Mock mode on a missing `VERTEX_PROJECT_ID` — a short placeholder clip or a deterministic
    stub job that completes after a delay, so the pending path is exercisable locally.
11. Job state survives a backend restart, or the failure mode is explicit and handled client-side.

### Tests
12. e2e covering the pending path against mock mode: create, generate, node shows pending, board
    stays interactive, node completes, video element present.
13. e2e: delete a node mid-job and confirm no console errors and no further polling.

## UI states to test
- [ ] Default — empty instruction, submit inert
- [ ] Pending — progress shown; canvas still fully usable
- [ ] Pending, then page reload — polling resumes
- [ ] Success — video renders with controls, corners match the node
- [ ] Failure — reason shown, recoverable
- [ ] Delete mid-job — no errors, polling stops
- [ ] Two video nodes generating at once
- [ ] Video node covered by another node — its port hides, same rule
- [ ] Selected — label and ports identical to the other kinds

## Zoom invariance
- [ ] 50% / 100% / 150%

## Out of scope
- Video as a downstream reference to another generation — a separate question about what the
  model accepts, and it should not gate shipping the node
- Scrubbing, trimming, thumbnails
- Storing output anywhere other than wherever #5 lands (GCS signed URLs)

## Definition of done
- [ ] `cd frontend && npx tsc --noEmit` — 0 new errors
- [ ] `cd backend && npx tsc --noEmit` — 0 new errors
- [ ] `cd backend && npm test` and `cd frontend && npm run test:e2e` both pass
- [ ] All UI states above verified manually
- [ ] No console errors in browser DevTools
- [ ] Zoom invariance confirmed at 50%, 100%, 150%

---
name: Extract Board.tsx image upload and clipboard
labels: refactor, canvas
---

Blocked by: `board-03` (both depend on `history.save`)

## Screen IDs
BOARD-01, TOOL-01 (the dock dispatches the upload), OBJ-01 — behaviour identical.

## Why this exists

These are the two largest remaining regions and the last that move cleanly:

| Region | Approx lines | Needs |
|---|---|---|
| image upload | 529–628 | container, `save`, `syncAllNodeGeometry`, `applyDraggability` |
| delete / copy / paste | 449–528 | the above, plus `transformer`, `selectionChrome` |

Upload is triggered by a `canvas:upload` CustomEvent dispatched from
`FloatingDock.tsx`, not by stage state, so it has no coupling to the stage at all. The clipboard's
copy/paste half is close to pure data transformation over node attrs.

## Acceptance criteria

1. Upload moves to `frontend/src/app/canvas/board/upload.ts` as
   `createUploadHandler(deps): (e: Event) => void`. `stripExtension` moves with it.
2. Clipboard moves to `frontend/src/app/canvas/board/clipboard.ts`. Delete may stay in
   `Board.tsx` if separating it from the keydown switch costs more than it saves — say which was
   chosen and why in the PR.
3. Upload preserves every existing behaviour:
   - `setTool("pointer")` **first**, so a node added under another tool is immediately draggable
     and the press does not pan the board
   - fit inside `DEFAULT_NODE_MAX_EDGE` in **both** axes via
     `Math.min(1, edge / naturalWidth, edge / naturalHeight)` — the leading `1` prevents
     upscaling a small image
   - `cornerRadius: NODE_CORNER_RADIUS`, `label: stripExtension(file.name)`
   - multi-file uploads cascade by 24px per file
   - non-image files are ignored
4. Clipboard preserves: multi-node copy, a fresh `crypto.randomUUID()` per pasted node, and
   `imageUrl` carried across so a pasted image renders.
5. Unit tests, `node` environment, no canvas:
   - `stripExtension`: `"photo-2024.final.png"` → `"photo-2024.final"`; a name with no dot is
     unchanged; a leading-dot name is not truncated to empty
   - upload sizing: 1600×900 → 320×180; 1000×3000 → 107×320; 300×200 → unchanged (no upscale);
     exactly-at-the-cap is unchanged
   - clipboard: copying N nodes then pasting yields N nodes with N distinct ids, none equal to a
     source id, and `imageUrl` preserved
6. The `canvas:upload` listener registration and teardown stay in `Board.tsx`.

## UI states to test
- [ ] Upload a single landscape image — correct size, rounded corners, name above when selected
- [ ] Upload a very tall image (e.g. 1000×3000) — fits vertically, not just horizontally
- [ ] Upload an image smaller than the cap — not upscaled
- [ ] Upload multiple files at once — cascade offset, all draggable
- [ ] Upload while a non-pointer tool is active — tool switches, node is immediately draggable
- [ ] Upload a non-image file — ignored, no crash
- [ ] Copy/paste a single node, then a multi-selection — pasted images render
- [ ] Delete with a single and a multi-selection
- [ ] Undo immediately after an upload and after a paste

## Zoom invariance
- [ ] 50%
- [ ] 100%
- [ ] 150%

## Out of scope
- `stage.on(...)` handlers (click, drag, wheel, mouse) — they stay; each is short but touches 5–6
  shared objects, so extracting them means threading a context object for no gain
- Stage / Layer / Transformer construction
- Unifying the two selection systems
- Any change to `FloatingDock.tsx`'s dispatch side

## Definition of done
- [ ] `cd frontend && npx tsc --noEmit` passes with 0 new errors
- [ ] `cd frontend && npm test` passes, including the new tests
- [ ] `git diff --name-only` shows only `Board.tsx`, the new `board/` files and tests
- [ ] All UI states above verified manually
- [ ] No console errors in browser DevTools
- [ ] Zoom invariance confirmed at 50%, 100%, 150%

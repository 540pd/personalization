---
name: Extract Board.tsx undo/redo history
labels: refactor, canvas
---

Blocked by: `board-02` (its `onRestore` composes geometry, draggability, chrome and hover)

## Screen IDs
BOARD-01, OBJ-01, UTIL-01 — behaviour identical before and after.

## Why this exists

Undo/redo (`Board.tsx` ~168–222) is the most self-contained stateful unit in the file and the one
with the least obvious invariants. It is snapshot-based and holds **live Konva node references**
rather than serialised attrs, deliberately: re-creating a `Konva.Image` would reload its bitmap.
That design is easy to break accidentally and currently has no test.

Its dependency count looks high (10) but 4 are its own internals and 4 more are the
"resync everything after a restore" tail, which collapses into a single callback. Real signature:

```ts
createHistory(container, onRestore): { save(): void; undo(): void; redo(): void }
```

## Acceptance criteria

1. Moves to `frontend/src/app/canvas/board/history.ts`, typed against
   `Konva.Container<Konva.Group | Konva.Shape>`.
2. `UNDO_LIMIT` keeps reading `NEXT_PUBLIC_UNDO_HISTORY_LIMIT` with a default of 10 and the
   existing `Number.isFinite(raw) && raw > 0` guard.
3. `Board.tsx` passes one `onRestore` callback performing, in order: `syncAllNodeGeometry`,
   `applyDraggability`, `hideHover`, `updateSelectionChrome`, `batchDraw`.
4. Snapshots continue to hold node references, not clones. A comment must state why
   (bitmap reload).
5. Unit tests against a `Konva.Group` — all of these pass with no canvas:
   - **z-order replay**: reorder via `moveToTop()`, then restoring a snapshot taken beforehand
     restores the original order. This is the behaviour that makes a drag-that-reordered-nodes
     undoable, and it is the most fragile part.
   - **remove and re-add**: a node deleted after a snapshot is re-added by `restore`, with its
     attrs, and `getParent()` is non-null afterwards
   - **nodes absent from a snapshot are removed** on restore
   - **redo stack is discarded** by a `save()` that follows an `undo()`
   - **limit is enforced**: with the limit set low, the oldest snapshot is dropped and `undo`
     stops at the floor rather than throwing
   - `undo` at index 0 and `redo` at the end are no-ops
6. History is created in the same scope and lifetime as the container. If the layer is ever
   destroyed and rebuilt the history must be rebuilt with it, since it holds node references —
   note this in a comment.

## UI states to test
- [ ] Move a node, Ctrl+Z — returns to prior position
- [ ] Delete a node, Ctrl+Z — node returns, with its image intact (not re-fetched / not blank)
- [ ] Drag node A over node B so A raises, Ctrl+Z — stacking order returns
- [ ] Ctrl+Z past the beginning — no crash, no console error
- [ ] Ctrl+Shift+Z / Ctrl+Y redo after undo
- [ ] Undo after a resize — size and position both restore
- [ ] Undo with a multi-selection active

## Zoom invariance
- [ ] 50%
- [ ] 100%
- [ ] 150%

## Out of scope
- Upload and clipboard (`board-04`)
- Panel position undo, which lives separately in `nodePanel.store.ts` (`posHistory`) — unifying
  the two undo stacks is its own question
- Changing the snapshot strategy (e.g. to structural sharing or a command log)

## Definition of done
- [ ] `cd frontend && npx tsc --noEmit` passes with 0 new errors
- [ ] `cd frontend && npm test` passes, including the new tests
- [ ] `git diff --name-only` shows only `Board.tsx`, `board/history.ts` and its test
- [ ] All UI states above verified manually
- [ ] No console errors in browser DevTools
- [ ] Zoom invariance confirmed at 50%, 100%, 150%

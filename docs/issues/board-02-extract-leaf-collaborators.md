---
name: Extract Board.tsx leaf collaborators (geometry, draggability, chrome, hover)
labels: refactor, canvas
---

Blocked by: `board-01` (test harness must run before these land with tests)

## Screen IDs
BOARD-01 (board workspace shell), OBJ-01 (canvas object selected) — behaviour must be
**identical** before and after. This is a pure move.

## Why this exists

`Board.tsx` is ~700 lines, of which only ~41 reference React. Every store read inside its mount
effect uses `.getState()`, so almost all of it is framework-free logic that happens to live
inside a `useEffect` and is therefore unreachable from a test.

Four regions have no dependency on anything else in the file and move first:

| Region | Approx lines | Needs |
|---|---|---|
| `applyDraggability` | 22–31 | container |
| `updateSelectionChrome` | 46–87 | container, transformer |
| hover outline build + `showHover`/`hideHover` | 132–166 | container |
| `syncNodeGeometry` / `syncAllNodeGeometry` | 223–246 | container |

## The design rule

**Type these against `Konva.Container`, not `Konva.Layer`.**

```
Layer extends Container<Group | Shape>
Group extends Container<Group | Shape>
```

Production passes the real `Layer`; tests pass a bare `Konva.Group`, which has no canvas of its
own and so needs no jsdom and no native `canvas`. A 5-test probe of exactly these operations ran
in 20ms in the `node` environment. Typing against `Layer` forfeits all of that.

## Acceptance criteria

1. The four regions move to `frontend/src/app/canvas/board/` as `draggability.ts`,
   `selectionChrome.ts`, `hoverOutline.ts`, `geometry.ts`. No behaviour change.
2. Every exported function takes its container as `Konva.Container<Konva.Group | Konva.Shape>`.
3. `applyDraggability` still reads `useToolStore.getState()` **at call time**, not from a
   parameter. Capturing the tool at construction is the original cause of the
   "upload under a non-pointer tool is permanently undraggable" bug — a comment must say so.
4. `hoverOutline` keeps its `moveToTop()` on show (shapes are added after the layer's chrome) and
   keeps reading the hovered node's own `cornerRadius`.
5. `selectionChrome` still leaves `transformer.nodes()` populated when multi-selected — it is the
   source of truth for Delete / Ctrl+C and for the `dragstart` selection check. Only
   `borderEnabled` / `resizeEnabled` are suppressed.
6. Unit tests, running in the `node` environment against a `Konva.Group`:
   - `geometry` publishes `canvasX/Y/W/H` using `width() * scaleX()`, not `width()`
   - `applyDraggability` sets `draggable` on `.selectable` nodes only when the tool is `pointer`
   - `selectionChrome` pools `.selection-outline` rects: N selected produces N outlines, and
     dropping to 1 selected leaves 0
7. `Board.tsx` imports and calls them; roughly 111 lines leave the file.

## UI states to test
- [ ] Default — no selection, no hover
- [ ] Hover over an uploaded image, and over a Create Image node
- [ ] Single selection — transformer border + 4 anchors
- [ ] Multi-selection — one outline per node, no combined box, no anchors
- [ ] Hover while a different node is selected
- [ ] Pan tool active — nodes not draggable, no hover outline

## Zoom invariance
- [ ] 50%
- [ ] 100%
- [ ] 150%

## Out of scope
- Undo/redo history (`board-03`)
- Upload and clipboard (`board-04`)
- Any `stage.on(...)` handler or `window.addEventListener` — these stay in `Board.tsx`; they need
  a Stage, which cannot be constructed under jsdom
- Unifying the two selection systems (`konvaSelection` + transformer vs `nodePanel.selectedId`)

## Definition of done
- [ ] `cd frontend && npx tsc --noEmit` passes with 0 new errors
- [ ] `cd frontend && npm test` passes, including the new tests
- [ ] `git diff --name-only` shows only `Board.tsx` and the new `board/` files + tests
- [ ] All UI states above verified manually
- [ ] No console errors in browser DevTools
- [ ] Zoom invariance confirmed at 50%, 100%, 150%

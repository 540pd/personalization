---
name: Shared node bounds and one occlusion test
labels: refactor, canvas, chore
---

Blocked by: `canvas-01` (occlusion composes `outputPoint` / `inputPoint`)

## Screen IDs
BOARD-01, OBJ-01 — behaviour identical before and after.

## Why this exists

There are two occlusion tests doing the same job, written hours apart during the same work:

```
KonvaNodePorts.isPortCovered          NodePanel.portsCovered
  px >= m.canvasX &&                    px >= q.canvasX &&
  px <= m.canvasX + m.canvasW &&        px <= q.canvasX + q.w &&
  py >= m.canvasY &&                    py >= q.canvasY - q.h / 2 &&
  py <= m.canvasY + m.canvasH           py <= q.canvasY + q.h / 2
```

The predicate is identical. The only difference is that **`KonvaNodeRecord.canvasY` is the node's
top edge and `PanelInstance.canvasY` is its vertical centre**, and the field names differ
(`canvasW`/`canvasH` vs `w`/`h`). That asymmetry is currently handled by a comment in
`nodePanel.store.ts` telling every reader to remember it. Four call sites have to.

`isPortCovered` additionally contains the rule that **a DOM overlay always covers a Konva node**,
so the z comparison applies between two Konva nodes but is meaningless panel-vs-node. That rule
is real and must survive, but it belongs stated once, not re-derived per caller.

With `tool.store.ts` declaring 9 unbuilt tools, each new node type currently adds another shape
to branch on.

## Acceptance criteria

1. New `frontend/src/lib/canvas/bounds.ts` exporting:
   - `boundsOf(node): { x, y, w, h }` with `y` always the **top edge**, accepting either record
     shape. The top-vs-centre difference is resolved here and nowhere else.
   - `contains(bounds, point): boolean`
   - `overlaps(a, b): boolean`
2. New `frontend/src/lib/canvas/occlusion.ts` exporting a single
   `isCovered(point, blockers): boolean`, replacing both current implementations.
3. The stacking rules are expressed once, with comments, and preserved exactly:
   - Konva vs Konva: covered only when the other node's `z` is strictly greater
   - Panel vs Konva: **always** covers — DOM overlays sit above the single `<canvas>`, so no z
     comparison applies
   - Panel vs Panel: array order is paint order, so only panels later in the array cover
4. `KonvaNodePorts.isPortCovered` and `NodePanel.portsCovered` are both deleted and replaced by
   calls into the shared module. Per-port granularity is retained for panels: a neighbour
   overlapping the left edge must hide only the input port, not the output port.
5. Unit tests, `node` environment, no canvas:
   - `boundsOf` returns the same `{x,y,w,h}` for a Konva record at `y=100,h=180` and a panel at
     `canvasY=190,h=180` — i.e. the two shapes normalise to one box
   - `contains` is inclusive on edges (matches today's `>=` / `<=`)
   - Konva-vs-Konva: a lower-`z` node's port is not covered by a higher node that misses the
     point; is covered when it contains it; `z` undefined is treated as 0
   - Panel-vs-Konva covers regardless of `z`, including when the panel's `z` would be lower
   - Panel-vs-Panel: only later-in-array panels cover
   - Per-port: a blocker over the left edge hides input only; over the right edge, output only

## UI states to test
- [ ] Uploaded image dragged over another — the lower one's port hides
- [ ] Create Image node dragged over an uploaded image — the image's port hides
- [ ] Create Image node dragged over another — the covered one's port hides, the top one's stays
- [ ] A blocker covering only the left edge of a panel — input port hides, output port remains
- [ ] Move the covering node away — ports reappear
- [ ] Nodes merely adjacent, not overlapping — no port hidden

## Zoom invariance
- [ ] 50%
- [ ] 100%
- [ ] 150%

## Out of scope
- Changing which things occlude what — this is a consolidation, not a behaviour change
- Selection border and label occlusion (a buried node's chrome still floats above a covering
  node; that is a known separate gap)
- A `CanvasNode` interface or node-type registry

## Definition of done
- [ ] `cd frontend && npx tsc --noEmit` passes with 0 new errors
- [ ] `cd frontend && npm test` passes, including the new tests
- [ ] `git diff --name-only` shows only `lib/canvas/**`, `KonvaNodePorts.tsx`, `NodePanel.tsx`, tests
- [ ] All UI states above verified manually
- [ ] No console errors in browser DevTools
- [ ] Zoom invariance confirmed at 50%, 100%, 150%

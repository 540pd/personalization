---
name: Shared canvas coordinate and port geometry (lib/canvas)
labels: refactor, canvas, chore
---

Blocked by: nothing. Independent of `board-01`..`board-04` and of `canvas-02`/`canvas-03`.

## Screen IDs
BOARD-01, OBJ-01, TOOL-01, UTIL-01 — every surface that positions something relative to a node.
Behaviour must be **identical** before and after; this is a consolidation, not a change.

## Why this exists

Three concepts are each implemented in several places, because there is no shared module to put a
*function* in. `frontend/src/` has `api, app, auth, components, constants, store, types` — no
`lib/`. The only importable shared module is `constants/canvas.constants.ts`, which is why a
sizing **function** (`placeholderSize`) ended up in a **constants** file.

**1. Port geometry already exists, correctly, but is private.**
`ConnectionOverlay.tsx:22-39` defines `panelOutputPt`, `panelInputPt` and `konvaOutputPt`. They
already encode all three tricky parts: the `PORT_FRACTION` vertical position, the canvas-to-screen
conversion, and the fact that `PanelInstance.canvasY` is a vertical **centre** while
`KonvaNodeRecord.canvasY` is a **top edge**. Meanwhile `KonvaNodePorts.tsx` and `NodePanel.tsx`
re-derive the same points inline.

**2. They diverged because of units.** ConnectionOverlay wants screen px; the occlusion tests want
canvas units. With no `toScreen()` helper, each caller inlined the conversion *into* the port
maths, so the port concept could not be shared. Splitting the two is what makes both reusable.

**3. Viewport centre is written two different ways for the same value:**

```
Board.tsx:538          -sx / s + W / (2 * s)
FloatingDock.tsx:475   (-sx + W / 2) / sc
```

Algebraically identical (verified: both yield 936.0 for sx=-420, s=1.25, W=1500). No text search
would ever have matched these to each other. Minimap computes the same thing a further 4 times.

## Acceptance criteria

1. New `frontend/src/lib/canvas/coords.ts` exporting, in terms of a `Viewport { x, y, scale }`:
   - `toScreen(pt, viewport)` and `toCanvas(pt, viewport)`, exact inverses
   - `viewportCentre(viewport, size)` returning the viewport centre **in canvas units**
2. New `frontend/src/lib/canvas/ports.ts` exporting `outputPoint(node)` and `inputPoint(node)`
   returning **canvas units**, with `inputPoint` returning `null` for source-only nodes
   (uploaded images have no input port).
3. Port functions handle both record shapes without the caller knowing which it holds — the
   top-edge vs centre difference is resolved inside, once.
4. Call sites updated, and the inline copies deleted:
   - `ConnectionOverlay.tsx` — its three private functions become `toScreen(outputPoint(n), vp)`
   - `KonvaNodePorts.tsx` — port position and the `PORT_WIDTH / (2 * scale)` inset
   - `NodePanel.tsx` — port rendering and `portsCovered`'s point maths
   - `Board.tsx:538-539` and `FloatingDock.tsx:475` — both use `viewportCentre`
   - `Minimap.tsx` — its 4 centre computations
5. `grep -c PORT_FRACTION` in the components directory drops to 0 outside `lib/canvas/`
   (`canvas.constants.ts` keeps the constant itself).
6. Unit tests in the `node` environment, no canvas needed:
   - `toCanvas(toScreen(p, vp), vp)` round-trips at scale 0.5, 1 and 1.5
   - `outputPoint` for a Konva record sits on the right edge at `PORT_FRACTION` down from the top
   - `outputPoint` for a panel accounts for canvasY being the centre: a panel at canvasY=100 with
     h=180 has its port at `100 - 90 + 180 * PORT_FRACTION`
   - `inputPoint` returns null for a Konva record and a point for a panel
   - `viewportCentre` reproduces both existing spellings' value

## UI states to test
- [ ] Ports sit on the node edge for both node types, unselected and selected
- [ ] Wires connect port-to-port with no visible offset
- [ ] Drag a node — ports and wires track it live, no lag or detachment
- [ ] Resize a node — ports stay on the edge throughout the drag
- [ ] A new Create Image node appears centred in the viewport
- [ ] An uploaded image appears centred in the viewport
- [ ] Minimap viewport rectangle matches the real viewport after pan and zoom

## Zoom invariance
- [ ] 50%
- [ ] 100%
- [ ] 150%

## Out of scope
- `bounds` / occlusion (`canvas-02`)
- Any change to how ports look, or to `PORT_FRACTION` / `PORT_WIDTH` values
- A `CanvasNode` interface or node-type registry — deliberately deferred until a third node type
  exists to shape it
- `Board.tsx` decomposition

## Definition of done
- [ ] `cd frontend && npx tsc --noEmit` passes with 0 new errors
- [ ] `cd frontend && npm test` passes, including the new tests
- [ ] `git diff --name-only` shows only `lib/canvas/**`, the listed call sites, and tests
- [ ] All UI states above verified manually
- [ ] No console errors in browser DevTools
- [ ] Zoom invariance confirmed at 50%, 100%, 150%

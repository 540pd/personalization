---
name: Add a node-kind discriminant to PanelInstance
labels: refactor, canvas, area:panels
---

Blocked by: #44, #45 (both rewrite `nodePanel.store.ts` and `NodePanel.tsx`)
Blocks: `node-02`, `node-03`, `node-04`

## Screen IDs
BOARD-01, IMG-02 — **no visible change**. This is groundwork.

## Why this exists

`tool.store.ts` already declares `generate-instruction` and `generate-video`, and both appear in
the dock's `GENERATE_IDS`. Neither has a handler: `FloatingDock.tsx` only matches
`item.id === "generate-image"` and everything else falls through to `else { closeAllPanels(); }`.
So two menu items exist and silently do nothing.

`PanelInstance` has no notion of what kind of node it is. It is implicitly an image node —
`preview?: string` is documented as "generated image data URL". Adding two more kinds without a
discriminant means either three parallel stores or three parallel components, and either would
duplicate every behaviour fixed in #40 and #41 three times over.

This issue adds the discriminant and nothing else, so the diff is reviewable and the risky part
(generalising the form) lands separately.

## Acceptance criteria

1. `PanelInstance` gains `kind: NodeKind` where
   `type NodeKind = "image" | "video" | "instruction"`.
2. `preview?: string` is replaced by a typed output:
   ```ts
   output?: { type: "image" | "video" | "text"; value: string };
   ```
   Every existing read of `preview` is updated. `setPreview` becomes `setOutput`.
3. `addPanel` takes the kind as a parameter. `FloatingDock` passes `"image"`; the other two menu
   items still no-op (wired up in `node-03` / `node-04`).
4. Any panel created before this change — or any code path that omits the kind — defaults to
   `"image"`, so nothing regresses.
5. Reference collection in the generate path reads `output` and still only contributes image
   outputs, since the backend cannot yet accept a text reference. A `TODO` marks the spot.
6. **No visible change whatsoever.** Image nodes behave exactly as they do today.

## UI states to test
- [ ] Create an image node — placeholder, ports, label, drag, resize all unchanged
- [ ] Generate — preview fills the node, name seeded from the instruction
- [ ] Connect an image node downstream and generate — references still sent with their names
- [ ] Undo a move, delete, re-create
- [ ] The video and instruction menu items still do nothing (unchanged, not newly broken)

## Zoom invariance
- [ ] 50% / 100% / 150%

## Out of scope
- Any new node kind reaching the screen (`node-03`, `node-04`)
- The kind registry and the generic form (`node-02`)
- Backend changes
- Renaming `nodePanel.store` / `NodePanel` to something kind-neutral — worth doing eventually,
  but a rename on top of a structural change makes the diff unreadable

## Definition of done
- [ ] `cd frontend && npx tsc --noEmit` — 0 new errors
- [ ] `cd frontend && npm run test:e2e` — the existing suite passes unchanged
- [ ] `git diff --name-only` shows only in-scope files
- [ ] No console errors in browser DevTools
- [ ] Zoom invariance confirmed at 50%, 100%, 150%

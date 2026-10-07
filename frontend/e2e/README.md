# Canvas end-to-end tests

Automated cover for `Board.tsx` and `NodePanel.tsx`, which **cannot be reached from unit tests**:
a `Konva.Stage` needs a real 2D context, and under jsdom `getContext("2d")` returns `null`, so
Konva throws on construction. Anything that needs a Stage belongs here; container-level logic
(`find`, `moveToTop`, `getAttrs`/`setAttrs`) works fine in vitest and should go there instead.

## Running

```bash
cd frontend
npm run test:e2e          # headless; starts a dev server if one is not already up
npm run test:e2e:ui       # Playwright UI mode, for debugging a single spec
npx playwright test e2e/ports.spec.ts --grep "zoom"
```

`playwright.config.ts` sets `reuseExistingServer: true`, so an already-running `npm run dev` is
used as-is. Point the suite elsewhere with `E2E_BASE_URL`.

Specs run **serially with one worker**. Konva drags are timing-sensitive and all specs share one
dev server; parallel runs were flaky.

## What is covered

| Spec | Invariant |
|---|---|
| `node-sizing` | Both node types default to `DEFAULT_NODE_MAX_EDGE`; tall images fit on the long edge; small images are not upscaled |
| `selection` | Press-drag takes over selection; `Delete` hits the dragged node; creating clears selection; panel state survives the drag reorder |
| `ports` | A covered node drops its port, the covering node keeps its own — at 50 / 100 / 150% zoom |
| `panel-placement` | The Create Image panel never opens off-screen; new nodes are centred |
| `node-label` | `LABEL_GAP` is the gap actually rendered; extensions are stripped; empty renames revert |

Specs assert against the **real constants** (`DEFAULT_NODE_MAX_EDGE`, `LABEL_GAP`, …) rather than
literals, so retuning a value does not require editing tests — only a genuine behaviour change does.

## Writing new specs

Use `helpers.ts`; it exists because every one of these probes needs the same five things.

**The trap worth knowing:** `addPanel` creates nodes at the viewport centre with only a 24px
cascade, so at the default width two of them overlap almost completely — which legitimately
occludes a port before your test has done anything. The first version of `ports.spec.ts` failed
for exactly this reason. Use `addPanelAt(page, dx)` whenever a test needs distinct nodes.

Other things the helpers encode:

- `openBoard` waits for `window.Konva.stages` rather than page load — `Board` mounts through
  `next/dynamic` with `ssr: false`.
- `tagPanels` stamps creation order onto each placeholder. Dragging reorders the DOM, because
  array order is paint order, so DOM index is **not** a stable identity across a drag.
- `uploadImage(page, w, h)` generates a PNG of exactly that size, so a sizing test can state its
  input inline instead of referring to a committed binary.
- `setZoom` drives the wheel handler; there is no store handle to set scale directly.

Confirm a new spec can actually fail. Break the behaviour deliberately, watch the test go red,
then restore — a canvas assertion that silently passes against a broken build is worse than none.

---
name: canvas-frontend
description: Konva canvas, FloatingDock, right panel tabs, ImageNode — everything under frontend/src/components/canvas/ and frontend/src/components/panels/.
---

## Stack snapshot

Next.js 15 App Router, React 19, TypeScript strict, Konva 9.x + react-konva 19.x,
Zustand 5 + zundo (undo/redo), Tailwind CSS 4.

## Key files

- `src/components/canvas/Board.tsx` — Konva Stage host. Pan (Stage draggable), zoom (wheel →
  `zoomToPoint`). Resize-observer keeps Stage dimensions in sync with the container.
- `src/components/canvas/FloatingDock.tsx` — TOOL-01. Fixed bottom-center dock, tool mode state.
- `src/components/canvas/shapes/ImageNode.tsx` — Konva Group node for AI-generated images.
  States: idle, generating, done, error. Luma reference: IMG-02, OBJ-01.
- `src/components/panels/RightPanel.tsx` — Tab shell (Chat / Assets / Skills) + collapse.
- `src/components/panels/ChatPanel.tsx`, `AssetsPanel.tsx`, `SkillsPanel.tsx` — tab content.
- `src/lib/viewport.ts` — Zustand store for `{ x, y, scale }`. `zoomToPoint()` keeps the
  cursor position stationary while scaling. `MIN_SCALE = 0.1`, `MAX_SCALE = 4`.
- `src/app/api/proxy/[...path]/route.ts` — Identity-token proxy. ALL API calls go here.
- `src/lib/api.ts` — API client functions. Always calls `/api/proxy/...`.
- `src/lib/authState.ts` — Memory-only ID token + session expiry pub/sub.

## Non-negotiables

- **Never call the backend directly from a client component** — always via `/api/proxy`.
- **Memory-only ID token** — `authState.ts` holds it in a module variable. No localStorage writes.
- **Placeholders stay until a node is confirmed created** — don't remove a placeholder
  `ImageNode` optimistically before the real image lands.
- **Viewport state lives in `useViewport()`** — never manage `x/y/scale` locally in Board.
- **Stage dimensions from ResizeObserver** — never use `window.innerWidth/Height` directly;
  the canvas container may not be full-viewport once panels and docks are in place.
- **`@use-gesture/react` for touch/pinch** — wire pinch-to-zoom through `zoomToPoint()` so
  the same zoom logic applies for wheel and touch.

## Testing

```bash
cd frontend && npm run dev   # verify in browser
npx tsc --noEmit             # must pass before done
```

Test canvas features at 50%, 100%, 150% zoom — pan/zoom interactions frequently break at
non-100% when viewport math is wrong. Use the zoom reset (viewport.reset()) to return to 1:1
before each test case.

## Don't

- Add a separate zoom/pan state outside `useViewport()` — one source of truth.
- Use `window.innerWidth/Height` for Stage size — use the ResizeObserver in `Board.tsx`.
- Import `konva` directly — always use `react-konva` named exports (`Stage`, `Layer`,
  `Group`, `Rect`, `Image`, `Text`, `Transformer`) in components.
- Add Konva nodes outside a `Layer` — Konva requires all shapes to be inside a Layer.

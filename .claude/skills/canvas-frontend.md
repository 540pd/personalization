---
name: canvas-frontend
description: The board (Konva canvas, Frames, nodes, wires), the dock and style bar, the sidebar sections and Library pages — everything under frontend/src/.
---

## Stack snapshot

Next.js 15 App Router, React 19, TypeScript strict, **Konva 9 used directly** (no react-konva:
the stage is built imperatively in `board/` and mounted by `Board.tsx`), Zustand 5, Tailwind 4
through SCSS (`@reference "…/globals.css"` + `@apply`), hotkeys-js for the dock's letters.
Vitest for units (node by default, `// @vitest-environment jsdom` per file), Playwright for e2e.

## Where things live (`frontend/src/`)

| Area | Path | What's there |
|---|---|---|
| Board shell | `app/canvas/components/Board.tsx` | Mounts the Konva stage and wires the `board/` modules; ~220 lines, keep it a composition |
| Board logic | `app/canvas/board/` | `stageEvents`, `boardShortcuts`, `drawTools`, `transformer`, `konvaHistory`, `placeBoard`, `clipboard`, `upload`, `shapes`/`text`, frames (`frame*`, `autoLayout*`), persistence (`canvasPersistence`, `boardFile`) |
| Frames | `app/canvas/components/FrameLayer.tsx` + `board/frame*.ts` | Their own Konva stage under the board; drag through `beginFrameMove` |
| Generated nodes | `app/canvas/components/NodePanel/` | `NodePanel.tsx` composes `hooks/` (drag, resize, settings, generation) and parts (`Placeholder`, `NodePorts`, `SelectionBox`, `ComposeEditor`) |
| Node kinds | `NodePanel/kinds/` | One spec per kind (image, video, Prompt, Compose); shared controls in `kinds/controls.tsx` |
| Dock | `components/FloatingDock/` | One `openMenu` state; `DockMenu`, `items`, `icons`, `useDockHotkeys` |
| Style bar | `components/ShapeStyleBar/` | `barModel` (what shows) and `styleBarPlacement` (where) are pure; `BarControls` render |
| Library pages | `components/Library/` | `useLibraryCollection` + `LibraryCollection`/`LibraryTable`, `useLibraryItemForm` + `ItemForm`; Skills and Agents are configuration on top |
| Shared UI | `src/components/` | `ConfirmDialog`, `Menu` (PortalMenu), `Modal/modalKeys`, `Toast`/`useToast`, `Tooltip`; the swatch grid is `app/canvas/components/SwatchGrid.tsx` |
| Canvas helpers | `src/lib/canvas/` | `history` (one undo timeline), `selection` (`selectOnly`), `events` (typed board events), `coords`, `bounds`, `boardKeys`, `labels`, `occlusion`, `ports` |
| DOM helpers | `src/lib/dom/` | `keys` (is this key the page's?), `listen`/`disposeAll`, `trackPointer`, `useDismiss`, `pickFile`, `download` |
| Storage | `src/lib/storage.ts`, `localValue.ts`, `localList.ts` | Over-quota fallback, deferred flush, versioned values and lists |
| Stores | `src/store/*.store.ts` | Zustand: `viewport`, `tool`, `nodePanel`, `konvaNodes`, `konvaSelection`, `frame`, `connection`, `skills`, `agents`, `settings`, `section`, … |
| API | `src/api/canvas.api.ts` | `postJson` / `apiFetch` → `/api/proxy/…` only |

## Use the shared pieces — don't write another copy

- **A keyboard shortcut** checks `boardKeyAllowed(e)` (board shown, not typing, not in a dialog).
  Never hand-write `instanceof HTMLInputElement` / `isContentEditable` / `aria-modal` checks.
- **Window listeners** go through `listen()`; collect the disposers and `disposeAll()` them.
- **A drag that follows the pointer on the window** uses `trackPointer({ onMove, onUp, onCancel })`
  — it handles `pointercancel` and window blur.
- **Board-wide signals** (upload, colour, load, clear, gesture) are `canvasEvent`s from
  `lib/canvas/events.ts`; add a new one there, typed, rather than a string event.
- **Close on outside click** with `useDismiss`; menus with `PortalMenu`; dialogs with
  `ConfirmDialog` / `modalKeys`; toasts with `useToast`.
- **Undo:** every edit ends with `canvasHistory.commit()` (optionally keyed, so one gesture is one
  step). Each node kind registers its own adapter; never keep a second history.
- **Selection:** `selectOnly(kind)` clears the other kinds. Konva nodes are selected through
  Board's transformer (`selectNodeIds`), panels via `isActive`, Frames via `selectedIds`.
- **Styles:** repeated looks are `@utility`s in `app/globals.css` (`focus-ring`,
  `focus-ring-inset`, `dialog-backdrop`, `menu-surface`, `glass`, `float-above`,
  `pill-tooltip`). Put each on its own `@apply` line.

## Non-negotiables

- **All API calls via `/api/proxy`** — never fetch the backend from a client component.
- **Memory-only ID token** — `auth/authState.ts` holds it in a module variable; no web storage.
- **Viewport state lives in `useViewport()`** — pan and zoom have one source of truth.
- **Stage size comes from the container's ResizeObserver** in `Board.tsx`, never `window.inner*`.
- **Comments explain past bugs (`#NNN`).** When moving code, move its comments with it.
- **Coordinates:** a panel's `canvasY` is its vertical centre; a Konva node's and a Frame's are
  their top. Use `boundsOf()` to get a top-left box from either.

## Testing

```bash
cd frontend
npx tsc --noEmit         # 0 errors
npx eslint <files>       # the only accepted warning: ShapeStyleBar's useLayoutEffect (#226)
npx vitest run           # pure logic and hooks; Konva.Stage needs a real canvas → e2e
npx playwright test e2e/<spec>.ts --reporter=line
```

- Canvas features are checked at 50%, 100% and 150% zoom (`setZoom` in `e2e/helpers.ts`).
  `setZoom` wheels at (700, 430): don't put a test object there, or it swallows the zoom.
- One Playwright run per checkout at a time; it reuses a dev server on :3000. Another checkout
  (a worktree) runs its own `next dev -p <port>` and sets `E2E_BASE_URL`.
- A fresh checkout puts Next's dev-tools button bottom-left, over the minimised sidebar, and
  `sidebar.spec.ts:224` fails. Copy `.next/cache/next-devtools-config.json` from a checkout where
  it was moved bottom-right.
- Known failures predating the refactor (#247): `compose-node:93`, `text.spec:161` (Control+A on
  macOS); `image-variants:175` is a test-timing flake after reload.

## Don't

- Add zoom/pan state outside `useViewport()`.
- Add Konva nodes outside a Layer, or create a second transformer config — use
  `createSelectionTransformer`.
- Grow `Board.tsx`, `NodePanel.tsx`, `FloatingDock.tsx` or `ShapeStyleBar.tsx` back into
  everything-files: put new behaviour in a module beside them.

---
name: Unify undo/redo into one history stack
labels: refactor, canvas, bug
---

Blocked by: nothing. Independent of `canvas-01`..`canvas-03` and `board-01`..`board-04`.
Best done before `board-03`, which would otherwise extract one of the two stacks being merged.

## Screen IDs
BOARD-01, OBJ-01, UTIL-01.

**This is the one item in the refactor set that changes behaviour.** Everything else is a move.
Read "What changes for the user" before starting.

## Why this exists

There are two independent undo systems, both bound to Ctrl+Z:

| | `Board.tsx` (closure) | `nodePanel.store.ts` |
|---|---|---|
| Covers | uploaded images / Konva nodes | Create Image nodes |
| Records | position, size, delete, paste, upload, **z-order** | **positions only** |
| Snapshot points | 7 | 1 (drag end) + 1 on create |
| Limit | 10, via `NEXT_PUBLIC_UNDO_HISTORY_LIMIT` | 20, hardcoded |
| Storage | array in a `useEffect` closure | Zustand store |

Precedence is an **event-phase race**: `NodePanel` listens in capture phase and calls
`stopImmediatePropagation()` *conditionally*, so panel undo wins whenever it has history and
otherwise falls through to Board's bubble-phase listener. This works and is commented, but the
policy lives in neither store and is only discoverable by reading both files. A third node type
(`tool.store.ts` declares 9 unbuilt tools) needs a third stack and a third place in that race.

Two user-visible consequences today:

1. **Ctrl+Z is not chronological.** Move an image, then move a panel, then press Ctrl+Z twice:
   both panel-history entries are consumed before the image move is reached, regardless of the
   order the edits happened in.
2. **Create Image nodes have far weaker undo.** `undoPos` restores positions by id via
   `applySnap`, which only touches panels that still exist:

| Operation | Uploaded image | Create Image node |
|---|---|---|
| Move | undo | undo |
| Resize | undo | **no** |
| Delete | undo | **no** |
| Create | undo | **no** |
| Rename | no | no |

## Proposed design

One stack, with a registered adapter per node type:

```ts
interface HistoryAdapter<S> {
  capture(): S;
  restore(snapshot: S): void;
}
// Board registers the Konva adapter (its snapshot holds live node references,
// so a Konva.Image is never re-created and its bitmap never reloads).
// NodePanel registers the panel adapter.
commit()        // captures from every adapter into one entry
undo() / redo() // restores every adapter from one entry
```

This removes the race (one entry = one moment in time across all node types), and makes a new
node type register a third adapter rather than add a third stack.

Exactly **one** Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z listener may exist in the app after this change.

## What changes for the user

Intentional, and these are the point of the issue:
- Ctrl+Z becomes chronological across both node types
- Create Image nodes gain undo for delete, resize and create
- One limit applies to both

Must **not** change:
- Undoing a delete must not reload an image's bitmap (snapshots keep node references)
- Undoing a drag that reordered nodes must restore stacking order
- Keystrokes must stay inert while typing in an `input` or `textarea`

## Acceptance criteria

1. One history module owns the stack; `Board.tsx`'s `historySnaps` / `historyIdx` and
   `nodePanel.store`'s `posHistory` / `posHistoryIdx` / `undoPos` / `redoPos` /
   `savePosSnapshot` are deleted.
2. Exactly one keydown listener handles undo/redo. `grep -rn "KeyZ" frontend/src` returns one
   handler. No `stopImmediatePropagation` is needed for undo precedence.
3. **Chronological ordering** — move an image, then move a panel, then Ctrl+Z: the *panel* move
   reverts. Ctrl+Z again: the *image* move reverts. Ctrl+Y twice replays both in order.
   This is the headline fix and should be the first test written.
4. A single limit, env-configurable via `NEXT_PUBLIC_UNDO_HISTORY_LIMIT`, default 20, applied to
   the merged stack. Note in a comment that each entry now holds both collections, so per-entry
   memory is larger than either old stack.
5. Create Image nodes gain: undo a delete (node returns with its size, preview and label), undo a
   resize, undo a create.
6. Every existing Konva behaviour is preserved — all 7 snapshot points keep committing:
   initial state, drag end, transform end, delete, paste, and both upload paths.
7. A commit captures **all** adapters, so undoing a panel move also restores Konva state to that
   same moment. Verify no cross-contamination: undoing a panel move must not move an image that
   was not touched.
8. Unit tests, `node` environment, with stub adapters (no canvas required):
   - commit/undo/redo across two adapters restores both
   - redo stack is discarded by a commit that follows an undo
   - the limit drops the oldest entry; undo at the floor and redo at the ceiling are no-ops
   - an adapter registered after some commits does not corrupt earlier entries
   - chronological ordering across adapters (the AC-3 scenario, as a unit test)

## UI states to test
- [ ] Move image, move panel, Ctrl+Z twice - reverts panel then image
- [ ] Interleave four edits across both types, undo all four, redo all four
- [ ] Delete an uploaded image, Ctrl+Z - returns with its bitmap intact, not re-fetched
- [ ] Delete a Create Image node, Ctrl+Z - returns with size, preview and label
- [ ] Resize each node type, Ctrl+Z - size and position both restore
- [ ] Drag node A over node B so A raises, Ctrl+Z - stacking order returns
- [ ] Upload, then Ctrl+Z; paste, then Ctrl+Z
- [ ] Ctrl+Z past the beginning and Ctrl+Y past the end - no crash, no console error
- [ ] Ctrl+Z while typing in the instruction textarea or renaming a label - does nothing
- [ ] Undo with a multi-selection active

## Zoom invariance
- [ ] 50%
- [ ] 100%
- [ ] 150%

## Out of scope
- Undoing a **rename**. Neither system supports it today: Board snapshots `getAttrs()`, which is
  Konva attrs only, and `label` lives in `konvaNodes` / `nodePanel`. Worth a follow-up issue -
  adding it here would hide a behaviour change inside a consolidation.
- Undoing viewport pan/zoom, panel open/close, or connection create/delete
- Moving to a command/inverse log instead of snapshots
- Extracting the Konva adapter into `lib/canvas` (`board-03` does that afterwards)

## Definition of done
- [ ] `cd frontend && npx tsc --noEmit` passes with 0 new errors
- [ ] `cd frontend && npm test` passes, including the new tests
- [ ] `git diff --name-only` shows only the history module, `Board.tsx`,
      `nodePanel.store.ts`, `NodePanel.tsx` and tests
- [ ] All UI states above verified manually
- [ ] No console errors in browser DevTools
- [ ] Zoom invariance confirmed at 50%, 100%, 150%

// One undo stack for the whole canvas.
//
// There used to be two, bound to the same keystroke. Board.tsx kept a closure
// array covering Konva nodes (position, size, delete, paste, z-order; limit
// 10) and nodePanel.store kept posHistory covering Create Image nodes
// (positions only; limit 20). Precedence was an event-phase race: NodePanel
// listened in capture phase and called stopImmediatePropagation conditionally,
// falling through to Board when its own history was exhausted.
//
// That had two consequences. Ctrl+Z was not chronological across node kinds —
// every panel entry was consumed before the first Konva one, whatever order
// the edits happened in. And a Create Image node could not undo a delete, a
// resize or a create, because applySnap only restored positions of panels that
// still existed.
//
// The fix is one timeline with an adapter per kind of state. One entry is one
// moment in time across everything, and a new node kind registers an adapter
// instead of entering a race.

const DEFAULT_LIMIT = 20;

export interface HistoryAdapter {
  /** Snapshot this slice of state. Must not return a live mutable reference. */
  capture(): unknown;
  /** Put this slice back. Called with a snapshot this adapter produced. */
  restore(snapshot: unknown): void;
}

/** One moment in time: a snapshot per registered adapter, keyed by name. */
type Entry = Record<string, unknown>;

export interface History {
  /** Returns an unregister function. */
  register(key: string, adapter: HistoryAdapter): () => void;
  /**
   * Capture every adapter as a single entry. Discards the redo stack.
   *
   * Pass the triggering event as `coalesceKey` when several listeners each
   * handle part of one gesture: one Delete removes wires, panels and images in
   * three separate handlers, and it should still be one undo step. A repeat
   * key overwrites the entry it made instead of adding another.
   */
  commit(coalesceKey?: object): void;
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  /** Drop every entry. For a fresh board, or a torn-down stage. */
  clear(): void;
  /**
   * Called after every commit, undo and redo: each is the board changing in a
   * way the user made. What saves the board (#203) listens here. Returns an
   * unsubscribe function.
   */
  subscribe(listener: () => void): () => void;
  readonly size: number;
}

export function createHistory(limit: number = DEFAULT_LIMIT): History {
  const adapters = new Map<string, HistoryAdapter>();
  let entries: Entry[] = [];
  let idx = -1;
  // Key of the newest entry, if it was committed with one.
  let lastKey: object | undefined;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  const apply = (entry: Entry) => {
    for (const [key, adapter] of adapters) {
      // An adapter registered after this entry was captured has no snapshot
      // in it. Restoring `undefined` would wipe that slice, so skip — the
      // entry simply predates it.
      if (key in entry) adapter.restore(entry[key]);
    }
  };

  return {
    register(key, adapter) {
      adapters.set(key, adapter);
      // Entries from before it registered have nothing of it, and undoing
      // back to one would leave it as it is now (#469: Board takes the
      // baseline in its mount effect, before the panels and wires register,
      // so a reload's first delete of a Create node could not be undone).
      // Nothing could change it before it registered, so its state now is
      // its state then: give those entries that.
      if (entries.some((e) => !(key in e))) {
        const now = adapter.capture();
        for (const e of entries) if (!(key in e)) e[key] = now;
      }
      return () => {
        adapters.delete(key);
      };
    },

    commit(coalesceKey) {
      const entry: Entry = {};
      for (const [key, adapter] of adapters) entry[key] = adapter.capture();
      if (coalesceKey && coalesceKey === lastKey && idx === entries.length - 1) {
        entries[idx] = entry;
        notify();
        return;
      }
      lastKey = coalesceKey;
      entries = entries.slice(0, idx + 1);
      entries.push(entry);
      if (entries.length > limit) entries.shift();
      idx = entries.length - 1;
      notify();
    },

    undo() {
      // Index 0 is the initial state; there is nothing before it.
      if (idx <= 0) return false;
      lastKey = undefined;
      idx -= 1;
      apply(entries[idx]);
      notify();
      return true;
    },

    redo() {
      if (idx >= entries.length - 1) return false;
      idx += 1;
      apply(entries[idx]);
      notify();
      return true;
    },

    canUndo: () => idx > 0,
    canRedo: () => idx < entries.length - 1,

    clear() {
      entries = [];
      idx = -1;
      lastKey = undefined;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    get size() {
      return entries.length;
    },
  };
}

// The app's single timeline. Board and NodePanel both register against it.
//
// Board's adapter closes over its Konva layer and its snapshots hold live node
// references — deliberately, so undoing a delete does not re-create a
// Konva.Image and reload its bitmap. That makes the entries only valid for as
// long as that layer lives, which is why Board clears the history when its
// stage is torn down.
const envLimit = Number(process.env.NEXT_PUBLIC_UNDO_HISTORY_LIMIT);
export const canvasHistory = createHistory(
  Number.isFinite(envLimit) && envLimit > 0 ? envLimit : DEFAULT_LIMIT
);

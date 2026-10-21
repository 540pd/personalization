import type { PersistOptions, PersistStorage, StorageValue } from "zustand/middleware";
import { createDeferredFlush, warnOnce, writeWithLeanFallback } from "@/lib/storage";
import { bumpNextId } from "./ids";
import type { NodePanelState, PanelInstance } from "./types";

type Persisted = { panels: PanelInstance[] };

const warn = warnOnce("[nodePanel]");

/**
 * localStorage that cannot take a user action down with it.
 *
 * zustand's persist middleware applies a change and then writes it out with
 * no error handling, so a write that throws escapes into whatever called the
 * store. Over quota is the usual way: a generated image is a data URL of a
 * megabyte or more, localStorage holds about five, and a batch of variants
 * blew straight past it -- the copies landed, then the throw aborted the
 * handler before their frame was made.
 *
 * So a failed write is retried without the images, which keeps every node's
 * position and inputs for the next load at the cost of its picture. Only if
 * that fails too is the save given up, with a warning; the board in memory is
 * untouched either way.
 */
export const panelStorage: PersistStorage<Persisted> = {
  getItem: (name) => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(name);
      return raw ? (JSON.parse(raw) as StorageValue<Persisted>) : null;
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    if (typeof window === "undefined") return;
    writeWithLeanFallback(
      window.localStorage,
      name,
      value,
      (): StorageValue<Persisted> => ({
        ...value,
        state: { panels: value.state.panels.map(({ output: _image, ...rest }) => rest) },
      }),
      {
        log: warn,
        lean: "Generated images are too large to keep across a reload; the nodes and their prompts are saved without them.",
        failed: "The board could not be saved to localStorage. It is unaffected until the page reloads.",
      },
    );
  },
  removeItem: (name) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(name);
    } catch {
      // Nothing to recover.
    }
  },
};

/** Quiet time before a save, in ms. Short enough that a reload rarely beats it. */
export const SAVE_DELAY_MS = 150;

/**
 * Saves the board once things settle, not on every change.
 *
 * persist writes on every set, and a write stringifies every panel -- image
 * data URLs and all, a megabyte or more each. A Frame drag sets positions on
 * every pointermove, so the board was serialised and written to localStorage
 * dozens of times a second, which is most of why a drag trailed the pointer
 * (#155). Only the latest value is kept; it is written once changes pause
 * for `delay`, or straight away when the page is hidden or unloaded, so a
 * reload or a closed tab still keeps the last move.
 */
export function deferredStorage<S>(inner: PersistStorage<S>, delay = SAVE_DELAY_MS): PersistStorage<S> {
  let pending: { name: string; value: StorageValue<S> } | null = null;

  const save = createDeferredFlush(() => {
    if (!pending) return;
    const { name, value } = pending;
    pending = null;
    void inner.setItem(name, value);
  }, delay);

  return {
    // A read must see the last write, even one still waiting.
    getItem: (name) => {
      save.flush();
      return inner.getItem(name);
    },
    setItem: (name, value) => {
      pending = { name, value };
      save.schedule();
    },
    removeItem: (name) => {
      if (pending?.name === name) pending = null;
      return inner.removeItem(name);
    },
  };
}

type LegacyPanel = PanelInstance & { isActive?: unknown; isPanelOpen?: unknown };

/** A saved panel without the selection flags older saves stored on it. */
export function withoutLegacyFlags(panels: LegacyPanel[]): PanelInstance[] {
  return panels.map(({ isActive: _a, isPanelOpen: _o, ...p }) => p);
}

export const persistOptions: PersistOptions<NodePanelState, Persisted> = {
  name: "gcos-node-panels",
  storage: deferredStorage(panelStorage),
  // Only persist canvas data: the selection and the open panel are not
  // saved, so a reload starts with nothing selected.
  partialize: (s) => ({ panels: s.panels }),
  onRehydrateStorage: () => (state) => {
    if (!state) return;
    // Saves from before the shared selection carry each node's own
    // isActive / isPanelOpen flags. They mean nothing now; drop them.
    state.panels = withoutLegacyFlags(state.panels);
    // Keep _nextId ahead of all restored IDs to avoid collisions.
    bumpNextId(state.panels);
  },
};

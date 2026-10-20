// The two ways the board writes to localStorage: a save that survives being
// over quota, and a save that waits for changes to settle. The panels
// (nodePanel.store) and the rest of the canvas (canvasPersistence) each need
// both.

import { disposeAll, listen } from "@/lib/dom/listen";

/** A logger for `tag` ("[board]") that warns once per session, then stays quiet. */
export function warnOnce(tag: string): (message: string) => void {
  let warned = false;
  return (message) => {
    if (warned) return;
    warned = true;
    console.warn(`${tag} ${message}`);
  };
}

export interface LeanWarnings {
  /** Where the warnings go; a `warnOnce` logger. */
  log: (message: string) => void;
  /** Logged when only the lean copy fit. */
  lean: string;
  /** Logged when nothing fit. */
  failed: string;
}

/**
 * Writes `full` under `key`. Over quota -- images are data URLs of a megabyte
 * or more, and localStorage holds about five -- it retries with `lean()`, the
 * same value without its pictures, so every position and input still
 * survives; the images themselves do not come back. Only if that fails too is
 * the save given up. Never throws: whatever is in memory is unaffected.
 */
export function writeWithLeanFallback(
  storage: Storage,
  key: string,
  full: unknown,
  lean: () => unknown,
  warn: LeanWarnings,
): "full" | "lean" | "failed" {
  try {
    storage.setItem(key, JSON.stringify(full));
    return "full";
  } catch {
    // Fall through to the lean save.
  }
  try {
    storage.setItem(key, JSON.stringify(lean()));
    warn.log(warn.lean);
    return "lean";
  } catch {
    warn.log(warn.failed);
    return "failed";
  }
}

export interface DeferredFlush {
  /** (Re)starts the wait; `write` runs once changes pause for `delay`. */
  schedule: () => void;
  /** Runs `write` now and cancels the wait. */
  flush: () => void;
  /** Stops listening for the page going away. Does not flush. */
  dispose: () => void;
}

/**
 * A save that runs once things settle, or straight away when the page is
 * hidden or unloaded, so a reload or a closed tab still keeps the last
 * change. `write` decides whether there is anything to save: it is also
 * called when nothing is pending.
 */
export function createDeferredFlush(write: () => void, delay: number): DeferredFlush {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    write();
  };

  const off: Array<() => void> = [];
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    off.push(
      listen(window, "pagehide", flush),
      listen(document, "visibilitychange", () => {
        if (document.visibilityState === "hidden") flush();
      }),
    );
  }

  return {
    schedule: () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    flush,
    dispose: () => disposeAll(off),
  };
}

// Saving the board to the user's account (#324), and loading it back.
//
// The localStorage copy stays (canvasPersistence, the panels' own persist):
// it shows the board at once on load and keeps every change offline. This
// keeps that copy in step with the account's, by revision:
//
//   on load   the server's newer copy replaces the local one -- unless the
//             local one holds unsaved changes made on top of the latest, which
//             are sent; on top of an older one, that is a conflict.
//   changed   saved once changes settle, one request at a time, the latest
//             state winning; offline or failing, tried again with backoff.
//   conflict  another tab or browser saved since: nothing is overwritten
//             until the user chooses (the banner).
//
// Written against its dependencies, not the stage, so every case is unit
// tested without a browser (__tests__/boardSync.test.ts).

import type { CurrentBoard, SaveReply } from "@/api/board.api";
import type { BoardFile } from "./boardFileFormat";
import { readSyncMeta, writeSyncMeta, type SyncMeta } from "./syncMeta";
import { useBoardSync, type BoardSyncState } from "@/store/boardSync.store";

export interface BoardSyncDeps {
  /** The signed-in account. */
  owner: string;
  fetchCurrent: () => Promise<CurrentBoard>;
  save: (revision: number, content: BoardFile, opts?: { keepalive?: boolean }) => Promise<SaveReply>;
  /** The board as it is now. */
  serialize: () => BoardFile;
  /** `content` as a checked board file, or null if it is not one. */
  parse: (content: unknown) => BoardFile | null;
  /** Replaces the board with `file`. */
  adopt: (file: BoardFile) => void;
  readMeta?: () => SyncMeta | null;
  writeMeta?: (meta: SyncMeta) => void;
  /** Quiet time before a save, ms. */
  delay?: number;
  /** Waits between retries, ms; the last repeats. */
  backoff?: number[];
}

export interface BoardSync {
  /** Load and reconcile, then save from here on. */
  start: () => Promise<void>;
  /** The board changed. */
  markDirty: () => void;
  /** The page is going: send a change still waiting, if one is (keepalive). */
  flush: () => void;
  /** After a conflict: take the account's copy, dropping this one's changes. */
  loadLatest: () => Promise<void>;
  dispose: () => void;
}

const DEFAULT_BACKOFF = [2_000, 4_000, 8_000, 16_000, 30_000, 60_000];

/** The same board, whenever each was serialised: savedAt aside. */
export function sameBoard(saved: unknown, local: BoardFile): boolean {
  if (typeof saved !== "object" || saved === null) return false;
  return JSON.stringify({ ...saved, savedAt: "" }) === JSON.stringify({ ...local, savedAt: "" });
}

export function createBoardSync(deps: BoardSyncDeps): BoardSync {
  const readMeta = deps.readMeta ?? readSyncMeta;
  const writeMeta = deps.writeMeta ?? writeSyncMeta;
  const delay = deps.delay ?? 1_000;
  const backoff = deps.backoff ?? DEFAULT_BACKOFF;

  // Another account's copy is never this one's to send.
  const meta = readMeta();
  const mine = meta?.owner === deps.owner ? meta : null;
  let revision = mine?.revision ?? 0;
  let pending = mine?.pending ?? false;

  let started = false;
  let disposed = false;
  let adopting = false;
  let inFlight = false;
  let again = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const set = (state: BoardSyncState, message: string | null = null) => {
    if (!disposed) useBoardSync.setState({ state, message });
  };
  const remember = () => writeMeta({ owner: deps.owner, revision, pending });
  const schedule = (ms: number, run: () => void) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      run();
    }, ms);
  };
  const retryIn = () => backoff[Math.min(attempt++, backoff.length - 1)];

  function adopt(file: BoardFile, at: number) {
    adopting = true;
    try {
      deps.adopt(file);
    } finally {
      adopting = false;
    }
    revision = at;
    pending = false;
    remember();
    set("saved");
  }

  async function push(keepalive = false): Promise<void> {
    if (disposed) return;
    if (inFlight) {
      again = true;
      return;
    }
    inFlight = true;
    again = false;
    set("saving");
    const reply = await deps.save(revision, deps.serialize(), keepalive ? { keepalive } : undefined);
    inFlight = false;
    if (disposed) return;

    if (reply.ok) {
      attempt = 0;
      revision = reply.revision;
      // Changed while it was on its way: that change is still to send.
      pending = again;
      remember();
      if (again) schedule(0, () => void push());
      else set("saved");
      return;
    }
    if (reply.kind === "conflict") {
      set("conflict");
      return;
    }
    if (reply.kind === "tooLarge") {
      // Not retried as it is: the next change tries again.
      set("tooLarge", reply.message);
      return;
    }
    set("retrying");
    schedule(retryIn(), () => void push());
  }

  async function reconcile(): Promise<void> {
    let current: CurrentBoard;
    try {
      current = await deps.fetchCurrent();
    } catch {
      set("retrying");
      schedule(retryIn(), () => void reconcile());
      return;
    }
    if (disposed) return;
    attempt = 0;
    started = true;

    if (pending) {
      // Unsaved changes: on top of the latest, they are sent; on top of an
      // older copy, saving them would undo what was saved elsewhere --
      // unless the account already holds exactly them: a save that landed
      // as the tab closed, too late to record that it had.
      if (current.revision === revision) return push();
      if (sameBoard(current.content, deps.serialize())) {
        revision = current.revision;
        pending = false;
        remember();
        set("saved");
        return;
      }
      set("conflict");
      return;
    }
    if (current.revision === 0) {
      // Nothing saved for this account yet. Its first board is this one,
      // whatever is on it (#324's import moves its pictures first).
      pending = true;
      remember();
      return push();
    }
    if (current.revision === revision) {
      set("saved");
      return;
    }
    const file = deps.parse(current.content);
    if (!file) {
      // A saved board this client cannot read: never overwrite it blind.
      set("conflict", "The saved board could not be read by this version of the app.");
      return;
    }
    adopt(file, current.revision);
  }

  const sync: BoardSync = {
    start: async () => {
      set("loading");
      useBoardSync.setState({ actions: { loadLatest: () => void sync.loadLatest() } });
      await reconcile();
    },
    markDirty: () => {
      if (adopting || disposed) return;
      if (!pending) {
        pending = true;
        remember();
      }
      // Before the first load, or in a conflict, changes are only kept.
      const { state } = useBoardSync.getState();
      if (!started || state === "conflict") return;
      schedule(delay, () => void push());
    },
    flush: () => {
      // Only a change still waiting on its timer: one in flight is already
      // on its way, and a conflict or a first load is not this one's to send.
      if (!timer || !pending || !started || inFlight) return;
      clearTimeout(timer);
      timer = null;
      void push(true);
    },
    loadLatest: async () => {
      let current: CurrentBoard;
      try {
        current = await deps.fetchCurrent();
      } catch {
        set("conflict", "Couldn't reach the server. Try again.");
        return;
      }
      const file = deps.parse(current.content);
      if (file) adopt(file, current.revision);
      else set("conflict", "The saved board could not be read by this version of the app.");
    },
    dispose: () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      useBoardSync.setState({ state: "off", message: null, actions: null });
    },
  };
  return sync;
}

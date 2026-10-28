// Board records (#322): one interface, kept in Firestore, on local disk or
// in memory by storageMode.ts, so callers never branch on where the data
// lives. The
// board's content arrives in #324; this is the list a user's boards come in.

import { isFirestoreMode } from "../firestore.js";
import { firestoreBoardStore } from "./firestore.js";
import { localBoardStore } from "./local.js";
import { memoryBoardStore } from "./memory.js";
import { localDataDir } from "../storageMode.js";
import type { BoardStore } from "./types.js";

export type { Board, BoardStore } from "./types.js";

let _store: BoardStore | null = null;

/** The store for this process's storage mode, made on first use. */
export function boardStore(): BoardStore {
  if (!_store) {
    const dir = localDataDir();
    _store = isFirestoreMode() ? firestoreBoardStore() : dir ? localBoardStore(dir) : memoryBoardStore();
  }
  return _store;
}

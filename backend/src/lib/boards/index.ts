// Board records (#322): one interface, kept in memory or in Firestore by
// storageMode.ts, so callers never branch on where the data lives. The
// board's content arrives in #324; this is the list a user's boards come in.

import { isFirestoreMode } from "../firestore.js";
import { firestoreBoardStore } from "./firestore.js";
import { memoryBoardStore } from "./memory.js";
import type { BoardStore } from "./types.js";

export type { Board, BoardStore } from "./types.js";

let _store: BoardStore | null = null;

/** The store for this process's storage mode, made on first use. */
export function boardStore(): BoardStore {
  _store ??= isFirestoreMode() ? firestoreBoardStore() : memoryBoardStore();
  return _store;
}

// Board records (#322): one interface, kept in Firestore, on local disk or
// in memory by storageMode.ts, so callers never branch on where the data
// lives. The
// board's content arrives in #324; this is the list a user's boards come in.

import { isFirestoreMode } from "../firestore.js";
import { firestoreBoardContentStore, firestoreBoardStore } from "./firestore.js";
import { localBoardContentStore, localBoardStore } from "./local.js";
import { memoryBoardContentStore, memoryBoardStore } from "./memory.js";
import { localDataDir } from "../storageMode.js";
import type { BoardContentStore, BoardStore } from "./types.js";

export type { Board, BoardContentStore, BoardStore, SavedContent, WriteResult } from "./types.js";

let _store: BoardStore | null = null;

/** The store for this process's storage mode, made on first use. */
export function boardStore(): BoardStore {
  if (!_store) {
    const dir = localDataDir();
    _store = isFirestoreMode() ? firestoreBoardStore() : dir ? localBoardStore(dir) : memoryBoardStore();
  }
  return _store;
}

let _content: BoardContentStore | null = null;

/** Board content (#324), kept where the board records are. */
export function boardContentStore(): BoardContentStore {
  if (!_content) {
    const dir = localDataDir();
    _content = isFirestoreMode() ? firestoreBoardContentStore() : dir ? localBoardContentStore(dir) : memoryBoardContentStore();
  }
  return _content;
}

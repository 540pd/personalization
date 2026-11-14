// Board records (#322): one interface, kept in Firestore, on local disk or
// in memory by storageMode.ts, so callers never branch on where the data
// lives. The
// board's content arrives in #324; this is the list a user's boards come in.

import { firestoreBoardContentStore, firestoreBoardStore } from "./firestore.js";
import { localBoardContentStore, localBoardStore } from "./local.js";
import { memoryBoardContentStore, memoryBoardStore } from "./memory.js";
import { storeFor } from "../storageMode.js";
import type { BoardContentStore, BoardStore } from "./types.js";

export type { Board, BoardContentStore, BoardStore, SavedContent, WriteResult } from "./types.js";

const pickBoardStore = storeFor<BoardStore>({ firestore: () => firestoreBoardStore(), local: localBoardStore, memory: memoryBoardStore });

/** The store for this process's storage mode, made on first use. */
export function boardStore(): BoardStore {
  return pickBoardStore();
}

const pickBoardContentStore = storeFor<BoardContentStore>({ firestore: () => firestoreBoardContentStore(), local: localBoardContentStore, memory: memoryBoardContentStore });

/** Board content (#324), kept where the board records are. */
export function boardContentStore(): BoardContentStore {
  return pickBoardContentStore();
}

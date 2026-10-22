// Jobs (#325), kept where boards and assets are (storageMode.ts).

import { isFirestoreMode } from "../firestore.js";
import { localDataDir } from "../storageMode.js";
import { firestoreJobStore } from "./firestore.js";
import { localJobStore } from "./local.js";
import { memoryJobStore } from "./memory.js";
import type { JobStore } from "./types.js";

export * from "./types.js";

let _store: JobStore | null = null;

export function jobStore(): JobStore {
  if (!_store) {
    const dir = localDataDir();
    _store = isFirestoreMode() ? firestoreJobStore() : dir ? localJobStore(dir) : memoryJobStore();
  }
  return _store;
}

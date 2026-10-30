// The saved Brand page (#454), kept where the Assets record is: Firestore,
// local disk or memory, by storageMode.ts.

import { isFirestoreMode } from "../firestore.js";
import { localDataDir } from "../storageMode.js";
import { firestoreBrandStore } from "./firestore.js";
import { localBrandStore } from "./local.js";
import { memoryBrandStore } from "./memory.js";
import type { BrandStore } from "./types.js";

export * from "./types.js";

let _store: BrandStore | null = null;

export function brandStore(): BrandStore {
  if (!_store) {
    const dir = localDataDir();
    _store = isFirestoreMode() ? firestoreBrandStore() : dir ? localBrandStore(dir) : memoryBrandStore();
  }
  return _store;
}

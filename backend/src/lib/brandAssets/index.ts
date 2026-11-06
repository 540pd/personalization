// The saved Assets page (#413), kept where the boards are: Firestore, local
// disk or memory, by storageMode.ts.

import { isFirestoreMode } from "../firestore.js";
import { localDataDir } from "../storageMode.js";
import { firestoreBrandAssetsStore } from "./firestore.js";
import { localBrandAssetsStore } from "./local.js";
import { memoryBrandAssetsStore } from "./memory.js";
import type { BrandAssetsStore } from "./types.js";

export * from "./types.js";

let _store: BrandAssetsStore | null = null;

export function brandAssetsStore(): BrandAssetsStore {
  if (!_store) {
    const dir = localDataDir();
    _store = isFirestoreMode() ? firestoreBrandAssetsStore() : dir ? localBrandAssetsStore(dir) : memoryBrandAssetsStore();
  }
  return _store;
}

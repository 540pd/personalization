// The saved Assets page (#413), kept where the boards are: Firestore, local
// disk or memory, by storageMode.ts.

import { storeFor } from "../storageMode.js";
import { firestoreBrandAssetsStore } from "./firestore.js";
import { localBrandAssetsStore } from "./local.js";
import { memoryBrandAssetsStore } from "./memory.js";
import type { BrandAssetsStore } from "./types.js";

export * from "./types.js";

const pickBrandAssetsStore = storeFor<BrandAssetsStore>({ firestore: () => firestoreBrandAssetsStore(), local: localBrandAssetsStore, memory: memoryBrandAssetsStore });

export function brandAssetsStore(): BrandAssetsStore {
  return pickBrandAssetsStore();
}

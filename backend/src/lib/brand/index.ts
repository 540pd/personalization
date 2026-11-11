// The saved Brand page (#454), kept where the Assets record is: Firestore,
// local disk or memory, by storageMode.ts.

import { storeFor } from "../storageMode.js";
import { firestoreBrandStore } from "./firestore.js";
import { localBrandStore } from "./local.js";
import { memoryBrandStore } from "./memory.js";
import type { BrandStore } from "./types.js";

export * from "./types.js";

const pickBrandStore = storeFor<BrandStore>({ firestore: () => firestoreBrandStore(), local: localBrandStore, memory: memoryBrandStore });

export function brandStore(): BrandStore {
  return pickBrandStore();
}

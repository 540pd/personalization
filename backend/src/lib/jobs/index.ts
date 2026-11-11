// Jobs (#325), kept where boards and assets are (storageMode.ts).

import { storeFor } from "../storageMode.js";
import { firestoreJobStore } from "./firestore.js";
import { localJobStore } from "./local.js";
import { memoryJobStore } from "./memory.js";
import type { JobStore } from "./types.js";

export * from "./types.js";

const pickJobStore = storeFor<JobStore>({ firestore: () => firestoreJobStore(), local: localJobStore, memory: memoryJobStore });

export function jobStore(): JobStore {
  return pickJobStore();
}

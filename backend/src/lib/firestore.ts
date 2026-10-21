import { Firestore } from "@google-cloud/firestore";
import { firestoreMode } from "./storageMode.js";

let _client: Firestore | null = null;

/** True when data goes to Firestore, real or emulated (storageMode.ts). */
export function isFirestoreMode(): boolean {
  return firestoreMode() !== "memory";
}

// The client finds the emulator by itself, from FIRESTORE_EMULATOR_HOST.
export function getFirestoreClient(): Firestore {
  if (!_client) {
    _client = new Firestore({ projectId: process.env.FIRESTORE_PROJECT_ID, ignoreUndefinedProperties: true });
  }
  return _client;
}

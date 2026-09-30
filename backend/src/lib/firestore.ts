import { Firestore } from "@google-cloud/firestore";

let _client: Firestore | null = null;

export function isFirestoreMode(): boolean {
  return !!process.env.FIRESTORE_PROJECT_ID;
}

export function getFirestoreClient(): Firestore {
  if (!_client) {
    _client = new Firestore({ projectId: process.env.FIRESTORE_PROJECT_ID });
  }
  return _client;
}

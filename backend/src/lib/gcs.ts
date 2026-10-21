import { Storage } from "@google-cloud/storage";
import { gcsMode, isCloud } from "./storageMode.js";

let _storage: Storage | null = null;

/** True when files go to Cloud Storage, real or emulated (storageMode.ts). */
export function isGcsMode(): boolean {
  return isCloud(gcsMode());
}

// The client finds the emulator by itself, from STORAGE_EMULATOR_HOST, and
// sends no credentials to it (a custom endpoint is unauthenticated unless
// asked otherwise).
export function getBucket() {
  if (!_storage) {
    _storage = new Storage();
  }
  return _storage.bucket(process.env.GCS_BUCKET_NAME as string);
}

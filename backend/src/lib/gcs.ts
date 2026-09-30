import { Storage } from "@google-cloud/storage";

let _storage: Storage | null = null;

export function isGcsMode(): boolean {
  return !!process.env.GCS_BUCKET_NAME;
}

export function getBucket() {
  if (!_storage) {
    _storage = new Storage();
  }
  return _storage.bucket(process.env.GCS_BUCKET_NAME as string);
}

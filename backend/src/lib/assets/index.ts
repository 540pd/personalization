// Stored files (#323): in memory, or in Cloud Storage with their metadata in
// Firestore, by storageMode.ts. Both are needed for the cloud store: bytes
// without metadata could not be listed or owned.

import { isFirestoreMode } from "../firestore.js";
import { isGcsMode } from "../gcs.js";
import { cloudAssetStore } from "./cloud.js";
import { memoryAssetStore } from "./memory.js";
import type { AssetStore } from "./types.js";

export * from "./types.js";

let _store: AssetStore | null = null;

export function assetStore(): AssetStore {
  if (!_store) {
    const cloud = isGcsMode() && isFirestoreMode();
    if (!cloud && (isGcsMode() || isFirestoreMode())) {
      console.warn("[assets] Cloud Storage and Firestore are both needed for stored assets; keeping them in memory.");
    }
    _store = cloud ? cloudAssetStore() : memoryAssetStore();
  }
  return _store;
}

/** The URL the browser loads an asset from: through the frontend's proxy,
 * so it is same-origin (no bucket CORS, no tainted canvas on export). */
export const assetUrl = (id: string) => `/api/proxy/assets/${id}/content`;

const ASSET_URL = /^\/api\/proxy\/assets\/([0-9a-f-]{36})\/content$/;

/** The asset id an asset URL names, or null for any other URL. */
export function assetIdFromUrl(url: string): string | null {
  return ASSET_URL.exec(url)?.[1] ?? null;
}

// Stored files (#323): in Cloud Storage with their metadata in Firestore, on
// local disk (#333), or in memory, by storageMode.ts. Both GCP services are
// needed for the cloud store: bytes without metadata could not be listed or
// owned.

import { isFirestoreMode } from "../firestore.js";
import { isGcsMode } from "../gcs.js";
import { cloudAssetStore } from "./cloud.js";
import { localAssetStore } from "./local.js";
import { memoryAssetStore } from "./memory.js";
import { localDataDir } from "../storageMode.js";
import type { AssetStore } from "./types.js";

export * from "./types.js";

let _store: AssetStore | null = null;

export function assetStore(): AssetStore {
  if (!_store) {
    const cloud = isGcsMode() && isFirestoreMode();
    if (!cloud && (isGcsMode() || isFirestoreMode())) {
      console.warn("[assets] Cloud Storage and Firestore are both needed for stored assets; using the local fallback.");
    }
    const dir = localDataDir();
    _store = cloud ? cloudAssetStore() : dir ? localAssetStore(dir) : memoryAssetStore();
  }
  return _store;
}

/**
 * Whether stored assets outlive this process: in the cloud store or on
 * local disk, yes; in memory, no. A dev backend restarts on every save (tsx
 * watch), and a board pointing at asset URLs would lose its images each
 * time, where data: URLs survive. So in memory mode generation keeps
 * answering data: URLs, and an upload says it is not durable, so the board
 * keeps its own copy.
 */
export function assetsAreDurable(): boolean {
  return (isGcsMode() && isFirestoreMode()) || localDataDir() !== null;
}

/** The URL the browser loads an asset from: through the frontend's proxy,
 * so it is same-origin (no bucket CORS, no tainted canvas on export). */
export const assetUrl = (id: string) => `/api/proxy/assets/${id}/content`;

const ASSET_URL = /^\/api\/proxy\/assets\/([0-9a-f-]{36})\/content$/;

/** The asset id an asset URL names, or null for any other URL. */
export function assetIdFromUrl(url: string): string | null {
  return ASSET_URL.exec(url)?.[1] ?? null;
}

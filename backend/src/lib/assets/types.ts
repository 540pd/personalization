// Stored files (#323): an upload or a generation's output, kept once and
// shown on the board from a URL instead of as a data: URL in the board.

import type { Readable } from "node:stream";

export type AssetSource = "upload" | "generated";

export interface Asset {
  id: string;
  userId: string;
  mimeType: string;
  /** Size in bytes. */
  bytes: number;
  source: AssetSource;
  createdAt: string;
}

/** Every call is scoped to `userId`: another user's asset is never found. */
export interface AssetStore {
  put(userId: string, data: Buffer, mimeType: string, source: AssetSource): Promise<Asset>;
  get(id: string, userId: string): Promise<Asset | null>;
  /** The asset and its bytes as a stream, for serving without buffering. */
  open(id: string, userId: string): Promise<{ asset: Asset; stream: Readable } | null>;
  list(userId: string): Promise<Asset[]>;
  remove(id: string, userId: string): Promise<void>;
}

/** What may be stored: images a browser shows safely, and MP4 video. Not
 * SVG -- served from this origin, its scripts would run as the app. */
export const ASSET_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4"] as const;

export const MAX_ASSET_BYTES = 25 * 1024 * 1024;

export function isAssetMimeType(type: string): boolean {
  return (ASSET_MIME_TYPES as readonly string[]).includes(type);
}

/** Newest first: the order a list is read in. */
export const byNewest = (a: Asset, b: Asset) => b.createdAt.localeCompare(a.createdAt);

// Stored files (#323): an upload or a generation's output, kept once and
// shown on the board from a URL instead of as a data: URL in the board.

import type { Readable } from "node:stream";
import type { AssetDetails, AssetKind } from "./details.js";

export type AssetSource = "upload" | "generated";

export interface Asset {
  id: string;
  userId: string;
  mimeType: string;
  /** Size in bytes. */
  bytes: number;
  source: AssetSource;
  createdAt: string;
  // What it is, for the Assets page (#412). Absent on board uploads,
  // generations and anything stored before them.
  kind?: AssetKind | null;
  /** The uploaded file's name, without any path. */
  name?: string;
  description?: string;
  details?: AssetDetails;
}

/** The parts of an asset that can be set on upload and changed after. */
export interface AssetInfo {
  kind?: AssetKind | null;
  name?: string;
  description?: string;
  details?: AssetDetails;
}

/** Every call is scoped to `userId`: another user's asset is never found. */
export interface AssetStore {
  put(userId: string, data: Buffer, mimeType: string, source: AssetSource, info?: AssetInfo): Promise<Asset>;
  /** Changes the info of the user's own asset; null when there is none. Never the bytes. */
  update(id: string, userId: string, info: AssetInfo): Promise<Asset | null>;
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

/** `asset` with the info that was given; anything left out stays as it was. */
export function withInfo<A extends Asset>(asset: A, info: AssetInfo = {}): A {
  const next = { ...asset };
  if (info.kind !== undefined) next.kind = info.kind;
  if (info.name !== undefined) next.name = info.name;
  if (info.description !== undefined) next.description = info.description;
  if (info.details !== undefined) next.details = info.details;
  return next;
}

/** Newest first: the order a list is read in. */
export const byNewest = (a: Asset, b: Asset) => b.createdAt.localeCompare(a.createdAt);

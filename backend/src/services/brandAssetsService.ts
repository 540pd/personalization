// The saved Assets page (#413): load it with its assets, save it by
// revision, and clear uploads the page made but never saved.

import { assetStore } from "../lib/assets/index.js";
import {
  brandAssetsStore,
  emptyBrandAssets,
  type BrandAssetsRecord,
  type BrandColours,
} from "../lib/brandAssets/index.js";
import { toView, type AssetView } from "./assetService.js";

export interface BrandAssetsView {
  /** 0 until the first save. */
  revision: number;
  updatedAt: string | null;
  record: BrandAssetsRecord;
  /** The page's assets with their details, in the record's order. A deleted one is left out. */
  assets: AssetView[];
}

export async function getBrandAssets(userId: string): Promise<BrandAssetsView> {
  const saved = await brandAssetsStore().read(userId);
  const record = saved?.record ?? emptyBrandAssets();
  const found = await Promise.all(record.assetIds.map((id) => assetStore().get(id, userId)));
  return {
    revision: saved?.revision ?? 0,
    updatedAt: saved?.updatedAt ?? null,
    record,
    assets: found.flatMap((a) => (a ? [toView(a)] : [])),
  };
}

const HEX = /^#[0-9a-fA-F]{6}$/;
export const MAX_PRODUCT_NAME = 200;
export const MAX_SKU = 100;
export const MAX_PAGE_ASSETS = 500;

const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;

/**
 * The record a PUT body describes, or why it describes none. The shape only:
 * whether the ids are the user's own is the save's to check. Product name
 * and master are not required here -- the page asks for them before it saves.
 */
export function readBrandAssets(body: Record<string, unknown>): BrandAssetsRecord | string {
  const { productName, sku, masterId, colours, assetIds } = body;
  if (!isText(productName, MAX_PRODUCT_NAME)) return `productName must be text, up to ${MAX_PRODUCT_NAME} characters.`;
  if (!isText(sku, MAX_SKU)) return `sku must be text, up to ${MAX_SKU} characters.`;
  if (typeof masterId !== "string") return "masterId must be text (empty for none).";
  if (colours === null || typeof colours !== "object" || Array.isArray(colours)) return "colours must be an object.";
  const c = colours as Record<string, unknown>;
  const picked: BrandColours = { primary: "", secondary: "", accent: "" };
  for (const key of ["primary", "secondary", "accent"] as const) {
    const value = c[key] ?? "";
    if (typeof value !== "string" || (value !== "" && !HEX.test(value))) return `colours.${key} must be a hex value like #1A2B3C, or empty.`;
    picked[key] = value.toUpperCase();
  }
  if (!Array.isArray(assetIds) || assetIds.length > MAX_PAGE_ASSETS || !assetIds.every((id) => typeof id === "string" && id)) {
    return `assetIds must be a list of up to ${MAX_PAGE_ASSETS} asset ids.`;
  }
  if (new Set(assetIds).size !== assetIds.length) return "assetIds lists an asset twice.";
  return { productName: productName.trim(), sku: sku.trim(), masterId, colours: picked, assetIds: assetIds as string[] };
}

export type SaveBrandAssets =
  | { ok: true; revision: number; updatedAt: string }
  | { ok: false; conflict: true; revision: number }
  | { ok: false; invalid: string };

export async function saveBrandAssets(userId: string, record: BrandAssetsRecord, baseRevision: number): Promise<SaveBrandAssets> {
  const assets = await Promise.all(record.assetIds.map((id) => assetStore().get(id, userId)));
  for (const [i, asset] of assets.entries()) {
    // Another user's id reads as missing: whether it exists is not theirs to learn.
    if (!asset) return { ok: false, invalid: `Asset ${record.assetIds[i]} was not found.` };
    if (!asset.kind) return { ok: false, invalid: `Asset ${asset.id} has no kind; set one before adding it to the page.` };
  }
  if (record.masterId) {
    const master = assets.find((a) => a!.id === record.masterId);
    if (!master) return { ok: false, invalid: "The master image must be one of the page's assets." };
    if (master.kind !== "productImage") return { ok: false, invalid: "The master must be a product image." };
  }

  const before = (await brandAssetsStore().read(userId))?.record.assetIds ?? [];
  const result = await brandAssetsStore().write(userId, record, baseRevision);
  if (!result.ok) return { ok: false, conflict: true, revision: result.revision };

  // Taken off the page and saved: the file goes too. Only page assets (with a
  // kind) are ever removed here -- never a board upload or a generation.
  const kept = new Set(record.assetIds);
  await removePageAssets(userId, before.filter((id) => !kept.has(id)));
  return result;
}

/**
 * Removes the user's page uploads that no save has attached: what Cancel and
 * a discarded leave call, so nothing piles up unseen. Answers how many went.
 */
export async function deletePendingUploads(userId: string): Promise<number> {
  const attached = new Set((await brandAssetsStore().read(userId))?.record.assetIds ?? []);
  const pending = (await assetStore().list(userId)).filter((a) => a.kind && !attached.has(a.id));
  await Promise.all(pending.map((a) => assetStore().remove(a.id, userId)));
  return pending.length;
}

async function removePageAssets(userId: string, ids: string[]): Promise<void> {
  for (const id of ids) {
    const asset = await assetStore().get(id, userId);
    if (asset?.kind) await assetStore().remove(id, userId);
  }
}

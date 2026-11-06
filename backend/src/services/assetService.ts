import {
  assetStore,
  assetsAreDurable,
  assetUrl,
  type Asset,
  type AssetDetails,
  type AssetInfo,
  type AssetKind,
  type AssetSource,
} from "../lib/assets/index.js";

/**
 * What the API answers for an asset: no owner, plus the URL to show it at.
 * The info (#412) is always there, empty for assets stored without it.
 */
export interface AssetView {
  id: string;
  url: string;
  mimeType: string;
  bytes: number;
  source: AssetSource;
  createdAt: string;
  kind: AssetKind | null;
  name: string;
  description: string;
  details: AssetDetails;
}

export function toView({ id, mimeType, bytes, source, createdAt, kind, name, description, details }: Asset): AssetView {
  return {
    id, url: assetUrl(id), mimeType, bytes, source, createdAt,
    kind: kind ?? null, name: name ?? "", description: description ?? "", details: details ?? {},
  };
}

export async function saveAsset(
  userId: string,
  data: Buffer,
  mimeType: string,
  source: AssetSource,
  info?: AssetInfo,
): Promise<AssetView> {
  return toView(await assetStore().put(userId, data, mimeType, source, info));
}

/** An upload's answer: the asset, and whether it outlives this process. */
export async function saveUpload(
  userId: string,
  data: Buffer,
  mimeType: string,
  info?: AssetInfo,
): Promise<AssetView & { durable: boolean }> {
  return { ...(await saveAsset(userId, data, mimeType, "upload", info)), durable: assetsAreDurable() };
}

/** The user's assets, newest first; only those of `kind` when it is given. */
export async function listAssets(userId: string, kind?: AssetKind): Promise<AssetView[]> {
  const all = await assetStore().list(userId);
  return (kind ? all.filter((a) => a.kind === kind) : all).map(toView);
}

export async function getAsset(id: string, userId: string): Promise<Asset | null> {
  return assetStore().get(id, userId);
}

/** Changes the user's own asset's info; null when there is no such asset. */
export async function updateAsset(id: string, userId: string, info: AssetInfo): Promise<AssetView | null> {
  const updated = await assetStore().update(id, userId, info);
  return updated ? toView(updated) : null;
}

export function openAsset(id: string, userId: string) {
  return assetStore().open(id, userId);
}

export function deleteAsset(id: string, userId: string): Promise<void> {
  return assetStore().remove(id, userId);
}

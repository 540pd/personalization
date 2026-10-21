import { assetStore, assetUrl, type Asset, type AssetSource } from "../lib/assets/index.js";

/** What the API answers for an asset: no owner, plus the URL to show it at. */
export interface AssetView {
  id: string;
  url: string;
  mimeType: string;
  bytes: number;
  source: AssetSource;
  createdAt: string;
}

export function toView({ id, mimeType, bytes, source, createdAt }: Asset): AssetView {
  return { id, url: assetUrl(id), mimeType, bytes, source, createdAt };
}

export async function saveAsset(userId: string, data: Buffer, mimeType: string, source: AssetSource): Promise<AssetView> {
  return toView(await assetStore().put(userId, data, mimeType, source));
}

export async function listAssets(userId: string): Promise<AssetView[]> {
  return (await assetStore().list(userId)).map(toView);
}

export function openAsset(id: string, userId: string) {
  return assetStore().open(id, userId);
}

export function deleteAsset(id: string, userId: string): Promise<void> {
  return assetStore().remove(id, userId);
}

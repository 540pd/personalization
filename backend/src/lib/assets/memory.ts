import { Readable } from "node:stream";
import { currentIsoDate } from "../../utils/date.js";
import { createId } from "../../utils/id.js";
import { byNewest, withInfo, type Asset, type AssetStore } from "./types.js";

/** Assets in this process only: local dev and tests, gone on restart. */
export function memoryAssetStore(): AssetStore {
  const assets = new Map<string, { asset: Asset; data: Buffer }>();
  const owned = (id: string, userId: string) => {
    const entry = assets.get(id);
    return entry?.asset.userId === userId ? entry : null;
  };
  return {
    async put(userId, data, mimeType, source, info) {
      const asset = withInfo<Asset>({ id: createId(), userId, mimeType, bytes: data.length, source, createdAt: currentIsoDate() }, info);
      assets.set(asset.id, { asset, data: Buffer.from(data) });
      return asset;
    },
    async get(id, userId) {
      return owned(id, userId)?.asset ?? null;
    },
    async update(id, userId, info) {
      const entry = owned(id, userId);
      if (!entry) return null;
      entry.asset = withInfo(entry.asset, info);
      return entry.asset;
    },
    async open(id, userId) {
      const entry = owned(id, userId);
      return entry ? { asset: entry.asset, stream: Readable.from([entry.data]) } : null;
    },
    async list(userId) {
      return [...assets.values()].map((e) => e.asset).filter((a) => a.userId === userId).sort(byNewest);
    },
    async remove(id, userId) {
      if (owned(id, userId)) assets.delete(id);
    },
  };
}

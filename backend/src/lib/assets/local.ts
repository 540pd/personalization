import { createReadStream } from "node:fs";
import path from "node:path";
import { currentIsoDate } from "../../utils/date.js";
import { createId } from "../../utils/id.js";
import { inside, readAllJson, readJson, removeFile, writeAtomic } from "../localDisk.js";
import { byNewest, withInfo, type Asset, type AssetStore } from "./types.js";

/**
 * Assets as files (`<dir>/assets/<id>.bin`, with `<id>.json` beside it):
 * the local-disk placeholder for Cloud Storage + Firestore (#333). The
 * bytes go first, as in the cloud store: metadata never points at a file
 * that is not there.
 */
export function localAssetStore(root: string): AssetStore {
  const dir = path.join(root, "assets");
  const meta = (id: string) => inside(dir, `${id}.json`);
  const bytes = (id: string) => inside(dir, `${id}.bin`);

  async function owned(id: string, userId: string): Promise<Asset | null> {
    let asset: Asset | null;
    try {
      asset = await readJson<Asset>(meta(id));
    } catch {
      return null;
    }
    return asset?.userId === userId ? asset : null;
  }

  return {
    async put(userId, data, mimeType, source, info) {
      const asset = withInfo<Asset>({ id: createId(), userId, mimeType, bytes: data.length, source, createdAt: currentIsoDate() }, info);
      await writeAtomic(bytes(asset.id), data);
      await writeAtomic(meta(asset.id), JSON.stringify(asset, null, 2));
      return asset;
    },
    get: owned,
    async update(id, userId, info) {
      const asset = await owned(id, userId);
      if (!asset) return null;
      const next = withInfo(asset, info);
      await writeAtomic(meta(id), JSON.stringify(next, null, 2));
      return next;
    },
    async open(id, userId) {
      const asset = await owned(id, userId);
      return asset ? { asset, stream: createReadStream(bytes(id)) } : null;
    },
    async list(userId) {
      return (await readAllJson<Asset>(dir)).filter((a) => a.userId === userId).sort(byNewest);
    },
    async remove(id, userId) {
      if (!(await owned(id, userId))) return;
      await removeFile(meta(id));
      await removeFile(bytes(id));
    },
  };
}

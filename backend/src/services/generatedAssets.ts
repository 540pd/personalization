// Generation and stored files (#323): a model's output is kept as an asset
// and answered as its URL; an asset URL sent as a reference is read back
// into bytes for the model.

import type { Reference } from "../capabilities/types.js";
import { assetIdFromUrl, assetStore, isAssetMimeType } from "../lib/assets/index.js";
import { saveAsset } from "./assetService.js";

const DATA_URL = /^data:([^;,]+);base64,(.+)$/s;

/**
 * `url` as a stored asset's URL, when it is a data: URL of a type assets
 * hold; any other URL (the mock's placeholder) comes back as it is. If the
 * store fails, the data: URL comes back too: the model call is already made
 * and billed, and losing its output to a storage hiccup would be worse than
 * a heavy board.
 */
export async function storeGenerated(userId: string, url: string): Promise<string> {
  const match = DATA_URL.exec(url);
  if (!match || !isAssetMimeType(match[1])) return url;
  try {
    return (await saveAsset(userId, Buffer.from(match[2], "base64"), match[1], "generated")).url;
  } catch (err) {
    console.error("[assets] could not store a generated file; answering it inline", err);
    return url;
  }
}

async function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks);
}

export type ResolvedReferences =
  | { ok: true; references: Reference[] | undefined }
  | { ok: false; message: string };

/**
 * The references with each asset URL replaced by its bytes as a data: URL,
 * which is what the capabilities send the model. One the user does not own,
 * or that is gone, fails the request: generating without an input the
 * canvas shows wired in would be a silent, billed surprise.
 */
export async function resolveAssetReferences(
  references: Reference[] | undefined,
  userId: string,
): Promise<ResolvedReferences> {
  if (!references?.length) return { ok: true, references };
  const resolved: Reference[] = [];
  for (const ref of references) {
    const id = ref.kind === "image" ? assetIdFromUrl(ref.url) : null;
    if (ref.kind !== "image" || !id) {
      resolved.push(ref);
      continue;
    }
    const found = await assetStore().open(id, userId);
    if (!found) {
      return { ok: false, message: `Reference "${ref.name ?? "image"}" is no longer stored. Replace it and try again.` };
    }
    const data = await readAll(found.stream);
    resolved.push({ ...ref, url: `data:${found.asset.mimeType};base64,${data.toString("base64")}` });
  }
  return { ok: true, references: resolved };
}

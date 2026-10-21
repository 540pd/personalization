import type { Bucket } from "@google-cloud/storage";
import type { DocumentSnapshot, Firestore } from "@google-cloud/firestore";
import { currentIsoDate } from "../../utils/date.js";
import { createId } from "../../utils/id.js";
import { getFirestoreClient } from "../firestore.js";
import { getBucket } from "../gcs.js";
import { byNewest, type Asset, type AssetStore } from "./types.js";

const ASSETS = "assets";

/** The object's name: under its owner, so a bucket listing reads by user. */
export const objectName = (userId: string, id: string) => `users/${encodeURIComponent(userId)}/assets/${id}`;

type AssetDoc = Omit<Asset, "id">;

function toAsset(snap: DocumentSnapshot): Asset | null {
  const data = snap.data() as AssetDoc | undefined;
  return data ? { id: snap.id, ...data } : null;
}

/**
 * Bytes in Cloud Storage, one metadata document per asset in Firestore
 * (assets/{id}). The object is written first: a document never points at a
 * file that is not there, and a failed write leaves at worst an orphan
 * object, never a broken asset.
 */
export function cloudAssetStore(db: Firestore = getFirestoreClient(), bucket: Bucket = getBucket()): AssetStore {
  const docs = db.collection(ASSETS);

  async function owned(id: string, userId: string): Promise<Asset | null> {
    const asset = toAsset(await docs.doc(id).get());
    return asset?.userId === userId ? asset : null;
  }

  return {
    async put(userId, data, mimeType, source) {
      const id = createId();
      await bucket.file(objectName(userId, id)).save(data, { contentType: mimeType, resumable: false });
      const doc: AssetDoc = { userId, mimeType, bytes: data.length, source, createdAt: currentIsoDate() };
      await docs.doc(id).create(doc);
      return { id, ...doc };
    },
    get: owned,
    async open(id, userId) {
      const asset = await owned(id, userId);
      return asset ? { asset, stream: bucket.file(objectName(userId, id)).createReadStream() } : null;
    },
    async list(userId) {
      const snap = await docs.where("userId", "==", userId).get();
      return snap.docs.map((d) => toAsset(d)!).sort(byNewest);
    },
    async remove(id, userId) {
      if (!(await owned(id, userId))) return;
      // The document first: once it is gone the asset is gone for every
      // reader, whether or not the object delete then succeeds.
      await docs.doc(id).delete();
      await bucket.file(objectName(userId, id)).delete({ ignoreNotFound: true });
    },
  };
}

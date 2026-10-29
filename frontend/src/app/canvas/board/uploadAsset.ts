// An uploaded image into the user's stored assets (#323).
//
// The node is already on the board with a local copy (a data URL), so it
// works at once and keeps working offline. This sends the original file in
// the background; when the store keeps it for good, the node's image
// becomes the asset's URL -- a few bytes in the saved board instead of the
// picture, and the full-size original for generations it feeds. In memory
// mode (local dev) the store says it is not durable and the copy stays.

import { apiFetch } from "@/api/canvas.api";
import { uploadFailure } from "@/api/assets.api";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useNodeUploads } from "@/store/nodeUploads.store";

interface StoredAsset {
  url: string;
  durable: boolean;
}

// The file behind each upload still to settle, for Retry. Memory only: a
// reload has no file to send, and the node keeps its local copy.
const pending = new Map<string, File>();

/** Sends `file` for node `id`, and points the node at the stored asset. */
export async function uploadNodeFile(id: string, file: File): Promise<void> {
  pending.set(id, file);
  const uploads = useNodeUploads.getState();
  uploads.set(id, { state: "uploading" });

  let status: number | null = null;
  try {
    const res = await apiFetch("assets", {
      method: "POST",
      body: file,
      headers: { "Content-Type": file.type },
    });
    status = res.status;
    if (!res.ok) throw new Error(`upload failed (${res.status})`);
    const asset = (await res.json()) as StoredAsset;

    // Deleted while it uploaded: nothing to point at, and upsert would
    // bring back a record for a node that is gone.
    const node = useKonvaNodes.getState().nodes[id];
    if (node && asset.durable) useKonvaNodes.getState().upsert({ ...node, imageUrl: asset.url });
    pending.delete(id);
    uploads.clear(id);
  } catch {
    if (!useKonvaNodes.getState().nodes[id]) {
      pending.delete(id);
      uploads.clear(id);
      return;
    }
    uploads.set(id, { state: "failed", message: uploadFailure(status) });
  }
}

/** Tries a failed upload again, with the same file. */
export function retryNodeUpload(id: string): void {
  const file = pending.get(id);
  if (file) void uploadNodeFile(id, file);
}

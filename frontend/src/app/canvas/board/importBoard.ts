// A board already in this browser becoming the account's first (#324).
//
// Its pictures are data: URLs -- uploads before #323, and every generation
// answered in memory mode. Saved as they are they make the account's board
// heavy (900 KB is the limit), so each goes into the user's stored assets
// first and the board points at it instead. The board as it was is kept in
// this browser too, so nothing is lost if anything here goes wrong.

import { apiFetch } from "@/api/canvas.api";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useNodePanel } from "@/store/nodePanel.store";
import type { BoardFile } from "./boardFileFormat";

export const BOARD_BACKUP_KEY = "gcos-board-backup";

/** Keeps `file` in this browser, as it was before the import. */
export function backupBoard(file: BoardFile, storage: Storage = window.localStorage): void {
  try {
    storage.setItem(BOARD_BACKUP_KEY, JSON.stringify(file));
  } catch {
    // Over quota: the board itself is still in localStorage and the account.
    console.warn("[board] Could not keep a backup of the board before saving it to the account.");
  }
}

/** A data: URL as a stored asset's URL, or null when it is not stored for good. */
export async function storeDataUrl(dataUrl: string): Promise<string | null> {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const res = await apiFetch("assets", { method: "POST", body: blob, headers: { "Content-Type": blob.type } });
    if (!res.ok) return null;
    const asset = (await res.json()) as { url: string; durable: boolean };
    return asset.durable ? asset.url : null;
  } catch {
    return null;
  }
}

const isDataUrl = (url: string | undefined): url is string => !!url && url.startsWith("data:");

/**
 * Moves every data: picture on the board -- uploaded images, and panels'
 * image and video outputs -- into stored assets, one at a time. One that
 * cannot be stored stays as it is. Returns how many moved and stayed.
 */
export async function moveImagesToAssets(store: (dataUrl: string) => Promise<string | null> = storeDataUrl) {
  let moved = 0;
  let kept = 0;

  for (const node of Object.values(useKonvaNodes.getState().nodes)) {
    if (!isDataUrl(node.imageUrl)) continue;
    const url = await store(node.imageUrl);
    // Deleted meanwhile: nothing to point at.
    const now = useKonvaNodes.getState().nodes[node.id];
    if (url && now) {
      useKonvaNodes.getState().upsert({ ...now, imageUrl: url });
      moved += 1;
    } else kept += 1;
  }

  for (const panel of useNodePanel.getState().panels) {
    const out = panel.output;
    if (!out || out.type === "text" || !isDataUrl(out.value)) continue;
    const url = await store(out.value);
    if (url && useNodePanel.getState().panels.some((p) => p.id === panel.id)) {
      useNodePanel.getState().setOutput(panel.id, { ...out, value: url });
      moved += 1;
    } else kept += 1;
  }

  return { moved, kept };
}

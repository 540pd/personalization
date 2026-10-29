// The user's stored assets (#323), through /api/proxy.

import { apiFetch } from "./canvas.api";

/** An asset as the backend lists it. It has no file name: uploads send only bytes. */
export interface AssetView {
  id: string;
  /** Served through the proxy, so it works as an image src as it is. */
  url: string;
  mimeType: string;
  bytes: number;
  source: "upload" | "generated";
  createdAt: string;
}

/** Why an upload failed, in the user's words. Shared by every upload. */
export function uploadFailure(status: number | null): string {
  if (status === 413) return "Too large to save (25 MB at most)";
  if (status === 415) return "This kind of file can't be saved";
  if (status === 401) return "Sign in again to save it";
  return "Couldn't save it to your account";
}

/** The user's image assets, newest first; throws when they cannot be had. */
export async function listImageAssets(): Promise<AssetView[]> {
  const res = await apiFetch("assets");
  if (!res.ok) throw new Error(`Loading assets failed (${res.status})`);
  const all = (await res.json()) as AssetView[];
  return all.filter((a) => a.mimeType.startsWith("image/"));
}

/** Stores `file` as an asset; throws with `uploadFailure`'s message. */
export async function uploadAsset(file: File): Promise<AssetView> {
  let res: Response;
  try {
    res = await apiFetch("assets", { method: "POST", body: file, headers: { "Content-Type": file.type } });
  } catch {
    throw new Error(uploadFailure(null));
  }
  if (!res.ok) throw new Error(uploadFailure(res.status));
  return (await res.json()) as AssetView;
}

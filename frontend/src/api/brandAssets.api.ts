// The Assets page's data (#412, #413), through /api/proxy.

import { apiFetch } from "./canvas.api";

export type AssetKind = "productImage" | "logo" | "adaptFrom" | "styleExample" | "reference" | "guidelines";

/** A stored asset as the backend answers it. */
export interface AssetView {
  id: string;
  /** Through the proxy, so it works as an image src as it is. */
  url: string;
  mimeType: string;
  bytes: number;
  source: "upload" | "generated";
  createdAt: string;
  kind: AssetKind | null;
  /** The uploaded file's name. */
  name: string;
  description: string;
  details: Record<string, string>;
}

export interface BrandColours {
  primary: string;
  secondary: string;
  accent: string;
}

/** The page as saved: which assets are on it, and the product and brand facts. */
export interface BrandAssetsRecord {
  productName: string;
  sku: string;
  masterId: string;
  colours: BrandColours;
  assetIds: string[];
}

export interface BrandAssetsView {
  /** 0 until the first save. */
  revision: number;
  updatedAt: string | null;
  record: BrandAssetsRecord;
  assets: AssetView[];
}

async function failure(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  return new Error(body?.message ?? fallback);
}

/** The saved page with its assets; throws when it cannot be had. */
export async function fetchBrandAssets(): Promise<BrandAssetsView> {
  const res = await apiFetch("brand-assets");
  if (!res.ok) throw await failure(res, `Loading assets failed (${res.status})`);
  return (await res.json()) as BrandAssetsView;
}

export type SaveReply = { ok: true; revision: number } | { ok: false; conflict: true; revision: number };

/** Saves the page against `revision`; a conflict is an answer, anything else throws. */
export async function saveBrandAssets(revision: number, record: BrandAssetsRecord): Promise<SaveReply> {
  const res = await apiFetch("brand-assets", { method: "PUT", body: JSON.stringify({ revision, ...record }) });
  if (res.status === 409) return { ok: false, conflict: true, revision: ((await res.json()) as { revision: number }).revision };
  if (!res.ok) throw await failure(res, "Couldn't save the assets.");
  return { ok: true, revision: ((await res.json()) as { revision: number }).revision };
}

/** Stores `file` as a page asset of `kind`; throws with the reason. */
export async function uploadPageAsset(file: File, kind: AssetKind): Promise<AssetView> {
  const query = new URLSearchParams({ kind, name: file.name });
  let res: Response;
  try {
    // A .md file often comes with no type at all: brand guidelines (#450) say theirs.
    const type = kind === "guidelines" ? "text/markdown" : file.type;
    res = await apiFetch(`assets?${query}`, { method: "POST", body: file, headers: { "Content-Type": type } });
  } catch {
    throw new Error("Couldn't upload it. Check your connection and try again.");
  }
  if (res.status === 413) throw new Error("Too large to upload (25 MB at most).");
  if (!res.ok) throw await failure(res, "Couldn't upload it.");
  return (await res.json()) as AssetView;
}

/** Changes an asset's description and details; throws with the reason. */
export async function updateAssetInfo(id: string, info: { description?: string; details?: Record<string, string> }): Promise<AssetView> {
  const res = await apiFetch(`assets/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(info) });
  if (!res.ok) throw await failure(res, "Couldn't save an image's details.");
  return (await res.json()) as AssetView;
}

/** Removes the page's uploads no save has attached. Never throws: it is clean-up. */
export async function deletePendingUploads(): Promise<void> {
  await apiFetch("brand-assets/pending", { method: "DELETE" }).catch(() => {});
}

/** Removes one stored asset (#463: an upload that landed after its tile went). Never throws: it is clean-up. */
export async function deleteAsset(id: string): Promise<void> {
  await apiFetch(`assets/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
}

/** One line about a stored image, written by the text model (#448); throws when it cannot be had. */
export async function describeAsset(id: string): Promise<string> {
  const res = await apiFetch(`assets/${encodeURIComponent(id)}/describe`, { method: "POST" });
  if (!res.ok) throw await failure(res, "Couldn't describe it.");
  return ((await res.json()) as { description: string }).description;
}

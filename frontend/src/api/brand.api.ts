// The Brand page saved to the account (#454), through /api/proxy.

import { apiFetch } from "./canvas.api";

/** As the backend keeps it: the brief's fields may be missing until first saved. */
export interface SavedBrandView<Brief> {
  /** 0 until the first save. */
  revision: number;
  updatedAt: string | null;
  brand: { homepageUrl: string; industry: string; campaign: Partial<Brief> };
}

/** The saved Brand page; throws when it cannot be had. */
export async function fetchBrand<Brief>(): Promise<SavedBrandView<Brief>> {
  const res = await apiFetch("brand");
  if (!res.ok) throw new Error(`Loading the brand failed (${res.status})`);
  return (await res.json()) as SavedBrandView<Brief>;
}

export type BrandSaveReply = { ok: true; revision: number } | { ok: false; conflict: true; revision: number };

/** Saves the Brand page against `revision`; a conflict is an answer, anything else throws. */
export async function saveBrandPage(revision: number, brand: object): Promise<BrandSaveReply> {
  const res = await apiFetch("brand", { method: "PUT", body: JSON.stringify({ revision, brand }) });
  if (res.status === 409) return { ok: false, conflict: true, revision: ((await res.json()) as { revision: number }).revision };
  if (!res.ok) throw new Error("Couldn't save the brand.");
  return { ok: true, revision: ((await res.json()) as { revision: number }).revision };
}

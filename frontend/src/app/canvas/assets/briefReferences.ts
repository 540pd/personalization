// The creative references a Campaign Brief can use (#442), worked out from
// the saved Assets page and the brief's picks. Pure, so the rules (saved
// references only, Always ones always in, picks of a reference that went
// ignored) are tested apart from the page.

import type { AssetView, BrandAssetsView } from "@/api/brandAssets.api";
import type { ReferenceUse } from "./assetsDraft";

export interface BriefReference {
  asset: AssetView;
  type: string;
  use: ReferenceUse;
  /** Set to Always on Assets: every campaign uses it, so it cannot be unpicked. */
  always: boolean;
  /** In use by this campaign: Always, or picked in the brief. */
  inUse: boolean;
}

/** The references saved on the Assets page, in its order, as this brief uses them. */
export function briefReferences(view: BrandAssetsView, picked: readonly string[]): BriefReference[] {
  // Saved ones only: an upload the page has not saved yet is not in the record.
  const saved = new Set(view.record.assetIds);
  return view.assets
    .filter((a) => a.kind === "reference" && saved.has(a.id))
    .map((asset) => {
      const always = asset.details.scope === "always";
      return {
        asset,
        type: asset.details.referenceType || "Other",
        use: asset.details.use === "asIs" ? "asIs" : "inspiration",
        always,
        inUse: always || picked.includes(asset.id),
      };
    });
}

/** "2 picked · 1 always", "1 always", or "None picked yet". */
export function referenceSummary(refs: readonly BriefReference[]): string {
  const always = refs.filter((r) => r.always).length;
  const picked = refs.filter((r) => r.inUse && !r.always).length;
  const parts = [picked > 0 && `${picked} picked`, always > 0 && `${always} always`].filter(Boolean);
  return parts.length ? parts.join(" · ") : "None picked yet";
}

/** The brief's picks with `id` picked or unpicked. */
export function togglePick(picked: readonly string[], id: string): string[] {
  return picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id];
}

// The product and logo a Campaign Brief shows from the saved Assets page
// (#444). Pure, so which ones are shown (the master, the primary logo or the
// first, saved ones only) is tested apart from the page.

import type { AssetView, BrandAssetsView } from "@/api/brandAssets.api";

export interface BriefProduct {
  image: AssetView;
  name: string;
  sku: string;
}

export interface BriefLogo {
  image: AssetView;
  /** Its logo type as set on Assets, "Primary logo" unless one is missing. */
  type: string;
}

/** Saved ones only: an upload the Assets page has not saved is not in its record. */
const savedOf = (view: BrandAssetsView, kind: AssetView["kind"]) => {
  const saved = new Set(view.record.assetIds);
  return view.assets.filter((a) => a.kind === kind && saved.has(a.id));
};

/** The saved master image with the product's name and SKU; null without a master. */
export function briefProduct(view: BrandAssetsView): BriefProduct | null {
  const image = savedOf(view, "productImage").find((a) => a.id === view.record.masterId);
  return image ? { image, name: view.record.productName, sku: view.record.sku } : null;
}

/** The saved primary logo, or the first saved logo when none is marked primary; null without one. */
export function briefLogo(view: BrandAssetsView): BriefLogo | null {
  const logos = savedOf(view, "logo");
  const image = logos.find((a) => a.details.logoType === "Primary logo") ?? logos[0];
  return image ? { image, type: image.details.logoType || "Logo" } : null;
}

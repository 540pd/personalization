// The Assets page while it is edited (#414): everything the page shows, in
// one value, changed only by the functions here. Pure, so the rules (one
// master, details per image, what Save checks and sends) are tested apart
// from the page.

import type { AssetView, BrandAssetsRecord, BrandAssetsView, BrandColours } from "@/api/brandAssets.api";

/** An image on the page, with its details as edited (saved with the page). */
export interface DraftImage {
  asset: AssetView;
  description: string;
  details: Record<string, string>;
}

export interface AssetsDraft {
  productName: string;
  sku: string;
  masterId: string;
  colours: BrandColours;
  /** Product images, in the order the page shows them. */
  images: DraftImage[];
  /** Assets of the other kinds, kept as they were until their sections exist. */
  others: AssetView[];
}

export const PRODUCT_IMAGE_TYPES = [
  "Packshot", "Hero creative", "Product reference", "Product angle", "Close-up / detail", "Variant / colourway", "Other",
] as const;
export const PRODUCT_VIEWS = ["Front", "Side", "Back", "Top", "3/4 angle", "Close-up", "Other"] as const;

/** Product images take PNG or JPG. */
export const PRODUCT_IMAGE_TYPES_ACCEPTED = ["image/png", "image/jpeg"];

const asImage = (asset: AssetView): DraftImage => ({ asset, description: asset.description, details: { ...asset.details } });

export function draftFrom(view: BrandAssetsView): AssetsDraft {
  const images = view.assets.filter((a) => a.kind === "productImage").map(asImage);
  return {
    productName: view.record.productName,
    sku: view.record.sku,
    // A master that has gone (deleted elsewhere) falls back to the first image.
    masterId: images.some((i) => i.asset.id === view.record.masterId) ? view.record.masterId : (images[0]?.asset.id ?? ""),
    colours: { ...view.record.colours },
    images,
    others: view.assets.filter((a) => a.kind !== "productImage"),
  };
}

/** Adds a just-uploaded image; the first one becomes the master. */
export function addImage(draft: AssetsDraft, asset: AssetView): AssetsDraft {
  return { ...draft, images: [...draft.images, asImage(asset)], masterId: draft.masterId || asset.id };
}

/** Takes an image off the page; the master's badge moves to the next image. */
export function removeImage(draft: AssetsDraft, id: string): AssetsDraft {
  const images = draft.images.filter((i) => i.asset.id !== id);
  return { ...draft, images, masterId: draft.masterId === id ? (images[0]?.asset.id ?? "") : draft.masterId };
}

export function makeMaster(draft: AssetsDraft, id: string): AssetsDraft {
  return draft.images.some((i) => i.asset.id === id) ? { ...draft, masterId: id } : draft;
}

export function editImage(draft: AssetsDraft, id: string, change: { description?: string; details?: Record<string, string> }): AssetsDraft {
  return {
    ...draft,
    images: draft.images.map((i) =>
      i.asset.id !== id
        ? i
        : {
            ...i,
            description: change.description ?? i.description,
            details: change.details ? { ...i.details, ...change.details } : i.details,
          },
    ),
  };
}

export const master = (draft: AssetsDraft): DraftImage | null => draft.images.find((i) => i.asset.id === draft.masterId) ?? null;
export const otherViews = (draft: AssetsDraft): DraftImage[] => draft.images.filter((i) => i.asset.id !== draft.masterId);

export interface SaveProblems {
  /** The doc's message, for the banner; null when Save may go ahead. */
  message: string | null;
  missingMaster: boolean;
  missingName: boolean;
}

/** What blocks Save (#414): a master image and a product name. Nothing else is blocked. */
export function saveProblems(draft: AssetsDraft): SaveProblems {
  const missingMaster = !master(draft);
  const missingName = !draft.productName.trim();
  return {
    message: missingMaster || missingName ? "Add a Master Product Image and Product Name before saving." : null,
    missingMaster,
    missingName,
  };
}

export function recordOf(draft: AssetsDraft): BrandAssetsRecord {
  return {
    productName: draft.productName.trim(),
    sku: draft.sku.trim(),
    masterId: draft.masterId,
    colours: draft.colours,
    assetIds: [...draft.images.map((i) => i.asset.id), ...draft.others.map((a) => a.id)],
  };
}

/** The images whose description or details changed since `asset` was loaded or saved. */
export function changedImages(draft: AssetsDraft): DraftImage[] {
  return draft.images.filter(
    (i) => i.description !== i.asset.description || JSON.stringify(i.details) !== JSON.stringify(i.asset.details),
  );
}

/** Whether the page differs from what it was loaded as. */
export function isDirty(draft: AssetsDraft, saved: AssetsDraft): boolean {
  return JSON.stringify(recordOf(draft)) !== JSON.stringify(recordOf(saved)) || changedImages(draft).length > 0;
}

// The Assets page while it is edited (#414): everything the page shows, in
// one value, changed only by the functions here. Pure, so the rules (one
// master, details per image, what Save checks and sends) are tested apart
// from the page.

import type { AssetKind, AssetView, BrandAssetsRecord, BrandAssetsView, BrandColours } from "@/api/brandAssets.api";

/**
 * The kinds the page edits as images with details: product images (#414),
 * and creatives to adapt from and style examples (#416). Others are kept
 * as they were until their sections exist.
 */
export const IMAGE_KINDS = ["productImage", "adaptFrom", "styleExample"] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];
const isImageKind = (kind: AssetKind | null): kind is ImageKind => (IMAGE_KINDS as readonly (AssetKind | null)[]).includes(kind);

/** An image on the page, with its details as edited (saved with the page). */
export interface DraftImage {
  asset: AssetView;
  description: string;
  details: Record<string, string>;
  /**
   * Still on its way (#415): shown at once from a local copy under a
   * temporary id, its details already editable; or failed, with the reason.
   * Absent once stored.
   */
  upload?: { state: "uploading" } | { state: "failed"; error: string };
}

export interface AssetsDraft {
  productName: string;
  sku: string;
  masterId: string;
  colours: BrandColours;
  /** Images of every kind the page edits, in the order it shows them. */
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

export const ADAPT_CREATIVE_TYPES = ["Campaign key visual", "Hero creative", "Social creative", "Display creative", "Other"] as const;
export const ASPECT_RATIOS = ["1:1", "4:5", "9:16", "16:9", "Other"] as const;
export const STYLE_EXAMPLE_TYPES = [
  "Social creative", "Campaign creative", "Product creative", "Layout reference", "Typography reference", "Logo usage", "Other",
] as const;

const asImage = (asset: AssetView): DraftImage => ({ asset, description: asset.description, details: { ...asset.details } });

export function draftFrom(view: BrandAssetsView): AssetsDraft {
  const images = view.assets.filter((a) => isImageKind(a.kind)).map(asImage);
  const products = images.filter(isProduct);
  return {
    productName: view.record.productName,
    sku: view.record.sku,
    // A master that has gone (deleted elsewhere) falls back to the first product image.
    masterId: products.some((i) => i.asset.id === view.record.masterId) ? view.record.masterId : (products[0]?.asset.id ?? ""),
    colours: { ...view.record.colours },
    images,
    others: view.assets.filter((a) => !isImageKind(a.kind)),
  };
}

const isProduct = (image: DraftImage) => image.asset.kind === "productImage";

export const imagesOf = (draft: AssetsDraft, kind: ImageKind): DraftImage[] => draft.images.filter((i) => i.asset.kind === kind);

/** Adds a just-uploaded image; the first product image becomes the master. */
export function addImage(draft: AssetsDraft, asset: AssetView): AssetsDraft {
  const masterId = draft.masterId || (asset.kind === "productImage" ? asset.id : "");
  return { ...draft, images: [...draft.images, asImage(asset)], masterId };
}

/**
 * Adds an image that is still uploading, shown from `preview` (a local copy)
 * under `tempId`. A creative or style example is named after its file to
 * start with (#416).
 */
export function addUploading(
  draft: AssetsDraft,
  tempId: string,
  file: { name: string; type: string; size: number },
  preview: string,
  kind: ImageKind = "productImage",
): AssetsDraft {
  const asset: AssetView = {
    id: tempId, url: preview, mimeType: file.type, bytes: file.size, source: "upload", createdAt: "",
    kind, name: file.name, description: "", details: {},
  };
  const image: DraftImage = {
    ...asImage(asset),
    details: kind === "productImage" ? {} : { name: file.name.replace(/\.[^.]+$/, "") },
    upload: { state: "uploading" },
  };
  const masterId = draft.masterId || (kind === "productImage" ? tempId : "");
  return { ...draft, images: [...draft.images, image], masterId };
}

/** The upload under `tempId` landed: the stored asset takes its place, with what was typed meanwhile. */
export function uploaded(draft: AssetsDraft, tempId: string, asset: AssetView): AssetsDraft {
  return {
    ...draft,
    images: draft.images.map((i) => (i.asset.id === tempId ? { asset, description: i.description, details: i.details } : i)),
    masterId: draft.masterId === tempId ? asset.id : draft.masterId,
  };
}

export function uploadFailed(draft: AssetsDraft, tempId: string, error: string): AssetsDraft {
  return { ...draft, images: draft.images.map((i) => (i.asset.id === tempId ? { ...i, upload: { state: "failed", error } } : i)) };
}

export function uploadRetried(draft: AssetsDraft, tempId: string): AssetsDraft {
  return { ...draft, images: draft.images.map((i) => (i.asset.id === tempId ? { ...i, upload: { state: "uploading" } } : i)) };
}

export const isUploading = (draft: AssetsDraft): boolean => draft.images.some((i) => i.upload?.state === "uploading");

/** Stored images only: one still uploading or failed has no asset to save. */
const stored = (draft: AssetsDraft) => draft.images.filter((i) => !i.upload);

/** Takes an image off the page; the master's badge moves to the next product image. */
export function removeImage(draft: AssetsDraft, id: string): AssetsDraft {
  const images = draft.images.filter((i) => i.asset.id !== id);
  const masterId = draft.masterId === id ? (images.find(isProduct)?.asset.id ?? "") : draft.masterId;
  return { ...draft, images, masterId };
}

export function makeMaster(draft: AssetsDraft, id: string): AssetsDraft {
  return draft.images.some((i) => i.asset.id === id && isProduct(i)) ? { ...draft, masterId: id } : draft;
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
export const otherViews = (draft: AssetsDraft): DraftImage[] => draft.images.filter((i) => isProduct(i) && i.asset.id !== draft.masterId);

export interface SaveProblems {
  /** The doc's message, for the banner; null when Save may go ahead. */
  message: string | null;
  missingMaster: boolean;
  missingName: boolean;
}

/** What blocks Save (#414): a master image and a product name. Nothing else is blocked. */
export function saveProblems(draft: AssetsDraft): SaveProblems {
  const hero = master(draft);
  const missingMaster = !hero || !!hero.upload;
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
    masterId: stored(draft).some((i) => i.asset.id === draft.masterId) ? draft.masterId : "",
    colours: draft.colours,
    assetIds: [...stored(draft).map((i) => i.asset.id), ...draft.others.map((a) => a.id)],
  };
}

/** The images whose description or details changed since `asset` was loaded or saved. */
export function changedImages(draft: AssetsDraft): DraftImage[] {
  return stored(draft).filter(
    (i) => i.description !== i.asset.description || JSON.stringify(i.details) !== JSON.stringify(i.asset.details),
  );
}

/** Whether the page differs from what it was loaded as. */
export function isDirty(draft: AssetsDraft, saved: AssetsDraft): boolean {
  return (
    JSON.stringify(recordOf(draft)) !== JSON.stringify(recordOf(saved)) ||
    changedImages(draft).length > 0 ||
    draft.images.some((i) => i.upload)
  );
}

/** Below this on its longest side, an image may come out soft (#415). */
export const LOW_RES_PX = 1500;

export function isLowRes(size: { width: number; height: number } | undefined): boolean {
  return !!size && Math.max(size.width, size.height) < LOW_RES_PX;
}

/**
 * Whether `file` is already among the page's images of `kind` (the same
 * image may well be both a product image and a style example). Exact for
 * files added this visit (by content hash); for stored ones, whose bytes the
 * page never fetched, the same name and size.
 */
export function isDuplicate(
  draft: AssetsDraft,
  file: { name: string; size: number },
  hash: string,
  hashes: Map<string, string>,
  kind: ImageKind = "productImage",
): boolean {
  return imagesOf(draft, kind).some(
    (i) => hashes.get(i.asset.id) === hash || (i.asset.name === file.name && i.asset.bytes === file.size),
  );
}

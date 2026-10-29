// The Assets page while it is edited (#414): everything the page shows, in
// one value, changed only by the functions here. Pure, so the rules (one
// master, details per image, what Save checks and sends) are tested apart
// from the page.

import type { AssetView, BrandAssetsRecord, BrandAssetsView, BrandColours } from "@/api/brandAssets.api";

/**
 * The kinds the page edits as images with details: product images (#414),
 * creatives to adapt from and style examples (#416), logos (#417) and
 * creative references (#418). Any other kind is kept as it was.
 */
export const IMAGE_KINDS = ["productImage", "adaptFrom", "styleExample", "logo", "reference"] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];
export const isImageKind = (kind: unknown): kind is ImageKind => (IMAGE_KINDS as readonly unknown[]).includes(kind);

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
/** Logos take PNG only: they are placed on creatives, so they need transparency (#412). */
export const LOGO_TYPES_ACCEPTED = ["image/png"];
export const LOGO_TYPES = ["Primary logo", "Secondary logo", "Monochrome logo", "Symbol / icon", "Other"] as const;
export const LOGO_USES = ["By default", "On light backgrounds", "On dark backgrounds", "As a reference only"] as const;

export const REFERENCE_TYPES = [
  "Background", "Scene / environment", "Mood board", "Lighting", "Composition / layout", "Styling / props", "Texture / pattern", "Other",
] as const;

/** How a reference is used: the image itself, or only its mood, light or setting. */
export type ReferenceUse = "asIs" | "inspiration";
/** Which campaigns use it: every one, or those whose brief picks it. */
export type ReferenceScope = "always" | "picked";

/** What a reference type is used as unless changed: a background or texture as is; the rest for inspiration. */
export const defaultUse = (type: string): ReferenceUse => (type === "Background" || type === "Texture / pattern" ? "asIs" : "inspiration");

/** A reference's new type, with How to use it set to that type's default (#418). */
export function setReferenceType(draft: AssetsDraft, id: string, type: string): AssetsDraft {
  return editImage(draft, id, { details: { referenceType: type, use: type ? defaultUse(type) : "" } });
}

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

/** What a new image's details start as: a creative is named after its file (#416); the first logo is the primary (#417). */
function startingDetails(draft: AssetsDraft, kind: ImageKind, fileName: string): Record<string, string> {
  if (kind === "adaptFrom" || kind === "styleExample") return { name: fileName.replace(/\.[^.]+$/, "") };
  if (kind === "logo") return imagesOf(draft, "logo").length ? { logoType: "Secondary logo" } : { logoType: "Primary logo", usage: "By default" };
  if (kind === "reference") return { referenceType: "Scene / environment", use: "inspiration", scope: "picked" };
  return {};
}

/** Adds an image that is still uploading, shown from `preview` (a local copy) under `tempId`. */
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
    details: startingDetails(draft, kind, file.name),
    upload: { state: "uploading" },
  };
  const masterId = draft.masterId || (kind === "productImage" ? tempId : "");
  return { ...draft, images: [...draft.images, image], masterId };
}

/**
 * Puts a new file in `id`'s place (#417: Replace on a logo), uploading under
 * `tempId`, its description and details kept. The old asset leaves the page,
 * so Save deletes it (#413).
 */
export function replaceImage(
  draft: AssetsDraft,
  id: string,
  tempId: string,
  file: { name: string; type: string; size: number },
  preview: string,
): AssetsDraft {
  return {
    ...draft,
    images: draft.images.map((i) =>
      i.asset.id !== id
        ? i
        : {
            ...i,
            asset: { ...i.asset, id: tempId, url: preview, mimeType: file.type, bytes: file.size, createdAt: "", name: file.name, description: "", details: {} },
            upload: { state: "uploading" },
          },
    ),
    masterId: draft.masterId === id ? tempId : draft.masterId,
  };
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
  /** The doc's messages, for the banner; null when Save may go ahead. */
  message: string | null;
  missingMaster: boolean;
  missingName: boolean;
  missingLogo: boolean;
  /** Brand colours that are not hex values. */
  badColours: (keyof BrandColours)[];
}

/** A colour as typed, made a hex value when it reads as one: "1a2b3c" is "#1A2B3C". Empty stays empty. */
export function cleanColour(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const hex = t.startsWith("#") ? t : `#${t}`;
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : t;
}

export const isColour = (value: string): boolean => value === "" || /^#[0-9A-F]{6}$/.test(cleanColour(value));

/**
 * What blocks Save: a master image and a product name (#414); a logo, when
 * the Campaign Brief marks it mandatory (#417); and colours the server would
 * refuse. Nothing else is blocked.
 */
export function saveProblems(draft: AssetsDraft, opts: { logoRequired?: boolean } = {}): SaveProblems {
  const hero = master(draft);
  const missingMaster = !hero || !!hero.upload;
  const missingName = !draft.productName.trim();
  const missingLogo = !!opts.logoRequired && !imagesOf(draft, "logo").some((i) => !i.upload);
  const badColours = (Object.keys(draft.colours) as (keyof BrandColours)[]).filter((k) => !isColour(draft.colours[k]));
  const messages = [
    (missingMaster || missingName) && "Add a Master Product Image and Product Name before saving.",
    missingLogo && "Add a Primary Logo because Logo is marked as mandatory in the Campaign Brief.",
    badColours.length > 0 && "Use hex values like #1A2B3C for the brand colours.",
  ].filter(Boolean);
  return { message: messages.length ? messages.join(" ") : null, missingMaster, missingName, missingLogo, badColours };
}

export function recordOf(draft: AssetsDraft): BrandAssetsRecord {
  return {
    productName: draft.productName.trim(),
    sku: draft.sku.trim(),
    masterId: stored(draft).some((i) => i.asset.id === draft.masterId) ? draft.masterId : "",
    colours: {
      primary: cleanColour(draft.colours.primary),
      secondary: cleanColour(draft.colours.secondary),
      accent: cleanColour(draft.colours.accent),
    },
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

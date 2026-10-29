// What an asset is, for the Assets page (#412): its kind, a description, and
// the fields its kind asks for. Kept beside the file so they survive a
// reload, and so generation can read them later.

export const ASSET_KINDS = ["productImage", "logo", "adaptFrom", "styleExample", "reference"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** A field takes one of its options, or (`TEXT`) short free text. */
const TEXT = null;
type Field = readonly string[] | typeof TEXT;

/** Each kind's fields. Values are stored as given: the page shows them. */
export const DETAIL_FIELDS: Record<AssetKind, Record<string, Field>> = {
  productImage: {
    imageType: ["Packshot", "Hero creative", "Product reference", "Product angle", "Close-up / detail", "Variant / colourway", "Other"],
    view: ["Front", "Side", "Back", "Top", "3/4 angle", "Close-up", "Other"],
    variant: TEXT,
  },
  logo: {
    logoType: ["Primary logo", "Secondary logo", "Monochrome logo", "Symbol / icon", "Other"],
    usage: ["By default", "On light backgrounds", "On dark backgrounds", "As a reference only"],
  },
  adaptFrom: {
    name: TEXT,
    creativeType: ["Campaign key visual", "Hero creative", "Social creative", "Display creative", "Other"],
    aspectRatio: ["1:1", "4:5", "9:16", "16:9", "Other"],
  },
  styleExample: {
    name: TEXT,
    exampleType: ["Social creative", "Campaign creative", "Product creative", "Layout reference", "Typography reference", "Logo usage", "Other"],
  },
  reference: {
    referenceType: ["Background", "Scene / environment", "Mood board", "Lighting", "Composition / layout", "Styling / props", "Texture / pattern", "Other"],
    use: ["asIs", "inspiration"],
    scope: ["always", "picked"],
  },
};

export const MAX_DESCRIPTION = 2000;
export const MAX_TEXT_FIELD = 200;
export const MAX_FILE_NAME = 200;

export type AssetDetails = Record<string, string>;

export function isAssetKind(value: unknown): value is AssetKind {
  return typeof value === "string" && (ASSET_KINDS as readonly string[]).includes(value);
}

/**
 * Why `details` does not fit `kind`, or null when it does. Every field is
 * optional; an empty string clears one. A field the kind does not have is an
 * error rather than ignored, so a typo is not silently lost.
 */
export function detailsError(kind: AssetKind | null, details: unknown): string | null {
  if (details === null || typeof details !== "object" || Array.isArray(details)) return "Details must be an object.";
  const fields = kind ? DETAIL_FIELDS[kind] : {};
  for (const [key, value] of Object.entries(details)) {
    if (!(key in fields)) return kind ? `A ${kind} asset has no "${key}".` : "Give the asset a kind before its details.";
    if (typeof value !== "string") return `"${key}" must be text.`;
    const options = fields[key];
    if (options === TEXT) {
      if (value.length > MAX_TEXT_FIELD) return `"${key}" can be up to ${MAX_TEXT_FIELD} characters.`;
    } else if (value !== "" && !options.includes(value)) {
      return `"${key}" must be one of: ${options.join(", ")}.`;
    }
  }
  return null;
}

/** A file name as it may be stored: trimmed, no path, capped. Empty for none. */
export function cleanFileName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const base = raw.split(/[\\/]/).pop() ?? "";
  return base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_FILE_NAME);
}

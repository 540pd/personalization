// What the Assets page checks about a file before it uploads it (#414, #415,
// #417, #450): whether it is the right type for its group, and whether the
// same file is already there. Moved out of AssetsPage (#462).

import {
  LOGO_TYPES_ACCEPTED,
  PRODUCT_IMAGE_TYPES_ACCEPTED,
  guidelinesProblem,
  type ImageKind,
} from "./assetsDraft";

/** What each kind of image is called in a message about it. */
export const NOUNS: Record<ImageKind, string> = {
  productImage: "product images",
  adaptFrom: "creatives to adapt from",
  styleExample: "style examples",
  logo: "logos",
  reference: "references",
  guidelines: "brand guidelines",
};

const LOGO_NOT_PNG = "The logo must be a PNG. Export it with a transparent background and try again.";

/** Why `file` can't be added as `kind` by its type and size alone, or null. */
export function wrongType(file: File, kind: ImageKind): string | null {
  if (kind === "guidelines") return guidelinesProblem(file);
  if (kind === "logo") return LOGO_TYPES_ACCEPTED.includes(file.type) ? null : LOGO_NOT_PNG;
  return PRODUCT_IMAGE_TYPES_ACCEPTED.includes(file.type) ? null : `${file.name}: ${NOUNS[kind]} must be PNG or JPG.`;
}

/** Whether `file` reads as UTF-8 text (#450: brand guidelines). */
export async function isUtf8(file: File): Promise<boolean> {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    return true;
  } catch {
    return false;
  }
}

/**
 * Why `file` can't be added as `kind`, or null. Guidelines (#450) must be
 * UTF-8 text, which is known only once read, so they are read only when
 * everything else about them is right.
 */
export async function checkFile(file: File, kind: ImageKind): Promise<string | null> {
  const wrong = wrongType(file, kind);
  if (wrong) return wrong;
  if (kind === "guidelines" && !(await isUtf8(file))) return guidelinesProblem(file, false);
  return null;
}

/** A file's SHA-256, to tell the same image added twice (#415). */
export async function contentHash(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Why `file` is refused as one already in its group. */
export function duplicateMessage(file: File, kind: ImageKind): string {
  return `${file.name}: this ${kind === "guidelines" ? "file" : "image"} is already here.`;
}

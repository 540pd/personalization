// The Brand page as saved (#454): reading and checking it, and the brief's
// shape and limits, shared with generation (#452), which reads the saved
// brief rather than one sent with each request.

import { brandStore, emptyBrand, type BrandRecord, type BrandWrite } from "../lib/brand/index.js";

const MAX_FIELD = 4000;
const MAX_TONES = 10;
const MAX_PICKED = 100;
const MAX_SHORT = 200;

/** The brief as the Brand page holds it (#409, #442): every field optional. */
export interface BriefInput {
  name?: string;
  objective?: string;
  audience?: string;
  insight?: string;
  message?: string;
  tones?: string[];
  offer?: string;
  mandatory?: { product?: boolean; logo?: boolean; cta?: boolean; legal?: boolean };
  ctaText?: string;
  legalText?: string;
  dos?: string;
  donts?: string;
  referenceIds?: string[];
}

export const TEXT_FIELDS = ["name", "objective", "audience", "insight", "message", "offer", "ctaText", "legalText", "dos", "donts"] as const;

/** The brief as given, checked; a string says what is wrong. Validated inline, no Zod (CLAUDE.md). */
export function readBrief(raw: unknown, at = "campaign"): BriefInput | string {
  if (raw === undefined) return {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return `${at} must be an object.`;
  const b = raw as Record<string, unknown>;

  const out: BriefInput = {};
  for (const key of TEXT_FIELDS) {
    const value = b[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.length > MAX_FIELD) return `${at}.${key} must be text, up to ${MAX_FIELD} characters.`;
    out[key] = value;
  }
  if (b.tones !== undefined) {
    if (!Array.isArray(b.tones) || b.tones.length > MAX_TONES || !b.tones.every((t) => typeof t === "string" && t.length <= 40)) {
      return `${at}.tones must be up to ${MAX_TONES} short words.`;
    }
    out.tones = b.tones as string[];
  }
  if (b.mandatory !== undefined) {
    const m = b.mandatory as Record<string, unknown>;
    if (typeof m !== "object" || m === null || Array.isArray(m) || !Object.values(m).every((v) => typeof v === "boolean")) {
      return `${at}.mandatory must be on/off switches.`;
    }
    out.mandatory = { product: m.product === true, logo: m.logo === true, cta: m.cta === true, legal: m.legal === true };
  }
  if (b.referenceIds !== undefined) {
    if (!Array.isArray(b.referenceIds) || b.referenceIds.length > MAX_PICKED || !b.referenceIds.every((id) => typeof id === "string")) {
      return `${at}.referenceIds must be a list of asset ids.`;
    }
    out.referenceIds = b.referenceIds as string[];
  }
  return out;
}

/** The Brand page from a PUT body's `brand`; a string says what is wrong. */
export function readBrand(raw: unknown): BrandRecord | string {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return "brand must be an object.";
  const { homepageUrl = "", industry = "", campaign } = raw as Record<string, unknown>;
  for (const [key, value] of [["homepageUrl", homepageUrl], ["industry", industry]] as const) {
    if (typeof value !== "string" || value.length > MAX_SHORT) return `brand.${key} must be text, up to ${MAX_SHORT} characters.`;
  }
  const brief = readBrief(campaign, "brand.campaign");
  if (typeof brief === "string") return brief;
  return { homepageUrl: homepageUrl as string, industry: industry as string, campaign: brief };
}

export interface BrandView {
  /** 0 until the first save. */
  revision: number;
  updatedAt: string | null;
  brand: BrandRecord;
}

export async function getBrand(userId: string): Promise<BrandView> {
  const saved = await brandStore().read(userId);
  return { revision: saved?.revision ?? 0, updatedAt: saved?.updatedAt ?? null, brand: saved?.brand ?? emptyBrand() };
}

export function saveBrand(userId: string, brand: BrandRecord, baseRevision: number): Promise<BrandWrite> {
  return brandStore().write(userId, brand, baseRevision);
}

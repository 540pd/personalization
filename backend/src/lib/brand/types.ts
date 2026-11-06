// The Brand page as saved (#454): Industry, the homepage URL and the one
// Campaign Brief (#409). One record per user, saved by revision like the
// Assets page (#413), so a second tab never silently overwrites the first.

import type { BriefInput } from "../../services/brandService.js";

export interface BrandRecord {
  homepageUrl: string;
  industry: string;
  campaign: BriefInput;
}

export interface SavedBrand {
  /** 1 for the first save, one more for each after; 0 means never saved. */
  revision: number;
  updatedAt: string;
  brand: BrandRecord;
}

export type BrandWrite =
  | { ok: true; revision: number; updatedAt: string }
  /** Saved elsewhere since `baseRevision`: here is the revision it made. */
  | { ok: false; revision: number };

export interface BrandStore {
  read(userId: string): Promise<SavedBrand | null>;
  write(userId: string, brand: BrandRecord, baseRevision: number): Promise<BrandWrite>;
}

export function emptyBrand(): BrandRecord {
  return { homepageUrl: "", industry: "", campaign: {} };
}

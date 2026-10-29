// The Assets page as saved (#413): the product's name and SKU, which image
// is the master, the brand colours, and which stored assets belong to the
// page. One record per user, saved by revision like the board (#324).

export interface BrandColours {
  /** `#RRGGBB`, or empty when not set. */
  primary: string;
  secondary: string;
  accent: string;
}

export interface BrandAssetsRecord {
  productName: string;
  sku: string;
  /** The master product image's asset id, or empty for none. */
  masterId: string;
  colours: BrandColours;
  /** The assets on the page, in the order the page shows them. */
  assetIds: string[];
}

export interface SavedBrandAssets {
  /** 1 for the first save, one more for each after; 0 means never saved. */
  revision: number;
  updatedAt: string;
  record: BrandAssetsRecord;
}

export type BrandAssetsWrite =
  | { ok: true; revision: number; updatedAt: string }
  /** Saved elsewhere since `baseRevision`: here is the revision it made. */
  | { ok: false; revision: number };

/**
 * One record per user. A write names the revision it was based on and is
 * refused if another has landed since -- a second tab -- so one never
 * silently overwrites the other.
 */
export interface BrandAssetsStore {
  read(userId: string): Promise<SavedBrandAssets | null>;
  write(userId: string, record: BrandAssetsRecord, baseRevision: number): Promise<BrandAssetsWrite>;
}

export function emptyBrandAssets(): BrandAssetsRecord {
  return { productName: "", sku: "", masterId: "", colours: { primary: "", secondary: "", accent: "" }, assetIds: [] };
}

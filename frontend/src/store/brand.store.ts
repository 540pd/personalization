import { create } from "zustand";

/**
 * The client's brand settings, edited in the Brand popup (#72).
 *
 * In memory only for now: a reload loses them. Persisting is a later issue,
 * and when it lands this store becomes the cache in front of the API rather
 * than the source of truth.
 */

export const ART_DIRECTION_COMPONENTS = [
  { id: "colourPalette", label: "Colour palette" },
  { id: "visualIdentity", label: "Visual identity" },
  { id: "productStaging", label: "Product staging" },
  { id: "lighting", label: "Lighting" },
  { id: "environment", label: "Environment / scene" },
  { id: "campaignContext", label: "Campaign context" },
] as const;

export type ArtDirectionId = (typeof ART_DIRECTION_COMPONENTS)[number]["id"];

export interface ReferenceImage {
  id: string;
  name: string;
  /**
   * A data URL rather than an object URL: these outlive the popup in a
   * draft that may be discarded, and data URLs need no revoking to avoid
   * leaking. They are display only, never sent to the model.
   */
  src: string;
}

export interface ArtDirection {
  description: string;
  /** Excluded from generation when true. Its contents are kept. */
  disabled: boolean;
  images: ReferenceImage[];
}

export interface BrandSettings {
  homepageUrl: string;
  industry: string;
  components: Record<ArtDirectionId, ArtDirection>;
}

export function emptyBrand(): BrandSettings {
  const components = {} as Record<ArtDirectionId, ArtDirection>;
  for (const { id } of ART_DIRECTION_COMPONENTS) {
    components[id] = { description: "", disabled: false, images: [] };
  }
  return { homepageUrl: "", industry: "", components };
}

interface BrandState {
  brand: BrandSettings;
  save: (brand: BrandSettings) => void;
}

export const useBrand = create<BrandState>((set) => ({
  brand: emptyBrand(),
  save: (brand) => set({ brand }),
}));

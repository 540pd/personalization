import { create } from "zustand";

/**
 * The client's brand settings, edited on the Brand page (#72, #219).
 *
 * In memory only for now: a reload loses them. Persisting is a later issue,
 * and when it lands this store becomes the cache in front of the API rather
 * than the source of truth.
 *
 * The Art-direction components (#72) were replaced by one Campaign Brief for
 * the MVP (#409, docs/sidebar/Brand_Page_MVP_Campaign_Brief_new.md). Nothing
 * outside the Brand page reads any of this yet: it is stored, not sent to
 * generation.
 *
 * The product and the logo themselves belong to the Assets page
 * (docs/sidebar/Assets_Page_Details.md): the brief only says whether each
 * must appear, so neither is described in two places.
 */

/** Suggested while typing the Objective, which also takes free text. */
export const OBJECTIVES = ["Awareness", "Consideration", "Engagement", "Conversion", "Retention"] as const;

export const TONES = ["Bold", "Playful", "Premium", "Warm", "Urgent", "Minimal", "Trustworthy"] as const;
export type Tone = (typeof TONES)[number];
export const MAX_TONES = 3;

/** Fixed for this phase; shown read-only on the page. */
export const MARKET = "Europe";
export const LANGUAGE = "English";

export interface MandatoryElements {
  /** The product from Assets must be shown. */
  product: boolean;
  /** The primary logo from Assets must appear. */
  logo: boolean;
  cta: boolean;
  legal: boolean;
}

export interface CampaignBrief {
  name: string;
  objective: string;
  audience: string;
  insight: string;
  message: string;
  tones: Tone[];
  /** Optional: many campaigns have no deal. */
  offer: string;
  mandatory: MandatoryElements;
  // An element's value is kept while it is switched off, so turning it back
  // on brings it back.
  ctaText: string;
  legalText: string;
  /** Free multi-line text. */
  dos: string;
  donts: string;
}

export interface BrandSettings {
  homepageUrl: string;
  industry: string;
  /** One campaign per brand for now. */
  campaign: CampaignBrief;
}

export function emptyCampaign(): CampaignBrief {
  return {
    name: "",
    objective: "",
    audience: "",
    insight: "",
    message: "",
    tones: [],
    offer: "",
    // Product, logo and CTA are expected in most creative; legal copy only
    // when an offer needs it.
    mandatory: { product: true, logo: true, cta: true, legal: false },
    ctaText: "",
    legalText: "",
    dos: "",
    donts: "",
  };
}

export function emptyBrand(): BrandSettings {
  return { homepageUrl: "", industry: "", campaign: emptyCampaign() };
}

interface BrandState {
  brand: BrandSettings;
  save: (brand: BrandSettings) => void;
}

export const useBrand = create<BrandState>((set) => ({
  brand: emptyBrand(),
  save: (brand) => set({ brand }),
}));

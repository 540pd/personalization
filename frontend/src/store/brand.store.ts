import { create } from "zustand";
import { fetchBrand, saveBrandPage } from "@/api/brand.api";

/**
 * The client's brand settings, edited on the Brand page (#72, #219).
 *
 * Saved to the account (#454): this store is the cache in front of
 * /api/brand. It loads once when the app opens (BrandPage's outer component
 * asks), and Save writes through it by revision, so a second tab is told
 * rather than overwritten. Generation reads the saved brief on the backend
 * (#452), so unsaved edits on the page never reach it.
 *
 * The Art-direction components (#72) were replaced by one Campaign Brief for
 * the MVP (#409, docs/sidebar/Brand_Page_MVP_Campaign_Brief_new.md).
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
  /**
   * Creative references from Assets this campaign uses (#442): those set to
   * "When a campaign picks it". Always ones are used anyway and not listed.
   */
  referenceIds: string[];
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
    referenceIds: [],
  };
}

export function emptyBrand(): BrandSettings {
  return { homepageUrl: "", industry: "", campaign: emptyCampaign() };
}

/** The saved brand with what it does not say yet filled in from a new brief's defaults. */
export function brandFrom(saved: { homepageUrl: string; industry: string; campaign: Partial<CampaignBrief> }): BrandSettings {
  const empty = emptyCampaign();
  return {
    homepageUrl: saved.homepageUrl,
    industry: saved.industry,
    campaign: { ...empty, ...saved.campaign, mandatory: { ...empty.mandatory, ...saved.campaign.mandatory } },
  };
}

export type BrandStatus = "idle" | "loading" | "ready" | "failed";
export type BrandSaveResult = "saved" | "conflict" | "failed";

interface BrandState {
  brand: BrandSettings;
  /** The saved revision the brand is from; 0 until first saved. */
  revision: number;
  status: BrandStatus;
  /** One more for each load: the Brand page starts its editor again on a new one, not on its own save. */
  loads: number;
  /** Loads the saved brand, once: again only after a failure. */
  load: () => Promise<void>;
  /** Loads it again whatever the state: Retry, or Load the latest after a conflict. */
  reload: () => Promise<void>;
  save: (brand: BrandSettings) => Promise<BrandSaveResult>;
}

export const useBrand = create<BrandState>((set, get) => ({
  brand: emptyBrand(),
  revision: 0,
  status: "idle",
  loads: 0,
  load: async () => {
    if (get().status === "loading" || get().status === "ready") return;
    await get().reload();
  },
  reload: async () => {
    set({ status: "loading" });
    try {
      const view = await fetchBrand<CampaignBrief>();
      set((s) => ({ brand: brandFrom(view.brand), revision: view.revision, status: "ready", loads: s.loads + 1 }));
    } catch {
      set({ status: "failed" });
    }
  },
  save: async (brand) => {
    try {
      const reply = await saveBrandPage(get().revision, brand);
      if (!reply.ok) return "conflict";
      set({ brand, revision: reply.revision });
      return "saved";
    } catch {
      return "failed";
    }
  },
}));

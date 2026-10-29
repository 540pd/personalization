import { afterEach, describe, expect, it } from "vitest";
import { LANGUAGE, MARKET, MAX_TONES, OBJECTIVES, TONES, emptyBrand, useBrand } from "../brand.store";

afterEach(() => useBrand.setState({ brand: emptyBrand() }));

describe("brand store (#409)", () => {
  it("starts with an empty brief and the requested mandatory defaults", () => {
    const { campaign, industry, homepageUrl } = emptyBrand();
    expect(industry).toBe("");
    expect(homepageUrl).toBe("");
    expect(campaign).toMatchObject({ name: "", objective: "", tones: [], offer: "", ctaText: "", legalText: "", dos: "", donts: "" });
    expect(campaign.mandatory).toEqual({ product: true, logo: true, cta: true, legal: false });
    expect(emptyBrand()).not.toHaveProperty("components");
    // The product and logo themselves live on the Assets page.
    expect(campaign).not.toHaveProperty("product");
    expect(campaign).not.toHaveProperty("logo");
  });

  it("gives each brand its own brief, not a shared one", () => {
    const a = emptyBrand();
    a.campaign.tones.push("Bold");
    a.campaign.mandatory.legal = true;
    expect(emptyBrand().campaign.tones).toEqual([]);
    expect(emptyBrand().campaign.mandatory.legal).toBe(false);
  });

  it("lists the objectives, tones and the fixed market", () => {
    expect(OBJECTIVES).toEqual(["Awareness", "Consideration", "Engagement", "Conversion", "Retention"]);
    expect(TONES).toEqual(["Bold", "Playful", "Premium", "Warm", "Urgent", "Minimal", "Trustworthy"]);
    expect(MAX_TONES).toBe(3);
    expect(`${MARKET} · ${LANGUAGE}`).toBe("Europe · English");
  });

  it("saves the whole brand, brief included", () => {
    const next = emptyBrand();
    next.campaign.name = "Monsoon Collection 2027";
    useBrand.getState().save(next);
    expect(useBrand.getState().brand.campaign.name).toBe("Monsoon Collection 2027");
  });
});

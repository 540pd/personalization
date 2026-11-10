import { afterEach, describe, expect, it, vi } from "vitest";

// The store is the cache in front of /api/brand (#454): its API, stubbed.
const api = vi.hoisted(() => ({ fetchBrand: vi.fn(), saveBrandPage: vi.fn() }));
vi.mock("@/api/brand.api", () => api);

import { LANGUAGE, MARKET, MAX_TONES, OBJECTIVES, TONES, emptyBrand, useBrand } from "../brand.store";

afterEach(() => {
  useBrand.setState({ brand: emptyBrand(), revision: 0, status: "idle", loads: 0 });
  vi.clearAllMocks();
});

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

  it("loads the saved brand once, filling in what it does not say from a new brief", async () => {
    api.fetchBrand.mockResolvedValue({ revision: 3, updatedAt: "x", brand: { homepageUrl: "", industry: "Sportswear", campaign: { name: "Urban", mandatory: { logo: false } } } });
    await useBrand.getState().load();
    await useBrand.getState().load();
    expect(api.fetchBrand).toHaveBeenCalledTimes(1);
    const { brand, revision, status } = useBrand.getState();
    expect([status, revision, brand.industry, brand.campaign.name]).toEqual(["ready", 3, "Sportswear", "Urban"]);
    expect(brand.campaign.tones).toEqual([]);
    expect(brand.campaign.mandatory).toEqual({ product: true, logo: false, cta: true, legal: false });
  });

  it("says when loading failed, and loads again after", async () => {
    api.fetchBrand.mockRejectedValueOnce(new Error("down"));
    await useBrand.getState().load();
    expect(useBrand.getState().status).toBe("failed");
    api.fetchBrand.mockResolvedValue({ revision: 0, updatedAt: null, brand: { homepageUrl: "", industry: "", campaign: {} } });
    await useBrand.getState().load();
    expect(useBrand.getState().status).toBe("ready");
  });

  it("saves the whole brand against its revision; a conflict or a failure keeps what was saved", async () => {
    useBrand.setState({ revision: 2, status: "ready" });
    const next = emptyBrand();
    next.campaign.name = "Monsoon Collection 2027";

    api.saveBrandPage.mockResolvedValueOnce({ ok: false, conflict: true, revision: 3 });
    expect(await useBrand.getState().save(next)).toBe("conflict");
    api.saveBrandPage.mockRejectedValueOnce(new Error("down"));
    expect(await useBrand.getState().save(next)).toBe("failed");
    expect(useBrand.getState().brand.campaign.name).toBe("");

    api.saveBrandPage.mockResolvedValueOnce({ ok: true, revision: 3 });
    expect(await useBrand.getState().save(next)).toBe("saved");
    expect(api.saveBrandPage).toHaveBeenLastCalledWith(2, next);
    expect([useBrand.getState().brand.campaign.name, useBrand.getState().revision]).toEqual(["Monsoon Collection 2027", 3]);
  });
});

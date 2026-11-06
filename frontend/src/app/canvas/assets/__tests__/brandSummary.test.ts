import { describe, expect, it } from "vitest";
import type { AssetView, BrandAssetsView } from "@/api/brandAssets.api";
import { emptyCampaign, type CampaignBrief } from "@/store/brand.store";
import { brandSummary } from "../brandSummary";

const asset = (id: string, kind: AssetView["kind"], details: Record<string, string> = {}): AssetView => ({
  id, url: `/api/proxy/assets/${id}/content`, mimeType: "image/png", bytes: 1, source: "upload", createdAt: "", kind, name: `${id}.png`, description: "", details,
});

const view = (assets: AssetView[], record: Partial<BrandAssetsView["record"]> = {}): BrandAssetsView => ({
  revision: 1, updatedAt: null,
  record: { productName: "Trail shoe", sku: "", masterId: "", colours: { primary: "", secondary: "", accent: "" }, assetIds: assets.map((a) => a.id), ...record },
  assets,
});

const brief = (over: Partial<CampaignBrief> = {}): CampaignBrief => ({ ...emptyCampaign(), ...over });

describe("brandSummary (#452)", () => {
  const all = [
    asset("front", "productImage"),
    asset("logo", "logo", { logoType: "Primary logo" }),
    asset("sand", "reference", { scope: "always" }),
    asset("street", "reference", { scope: "picked" }),
    asset("park", "reference", { scope: "picked" }),
    asset("rules", "guidelines"),
  ];

  it("names each part that will be sent", () => {
    expect(brandSummary(view(all, { masterId: "front" }), brief({ name: "Urban Running", referenceIds: ["street"] }))).toEqual([
      "Brief", "Trail shoe", "Logo", "2 references", "1 guidelines file",
    ]);
  });

  it("leaves out the product and logo when the brief does not make them mandatory", () => {
    const off = brief({ mandatory: { product: false, logo: false, cta: true, legal: false } });
    expect(brandSummary(view(all, { masterId: "front" }), off)).toEqual(["1 reference", "1 guidelines file"]);
  });

  it("counts at most four references", () => {
    const many = Array.from({ length: 6 }, (_, i) => asset(`r${i}`, "reference", { scope: "always" }));
    expect(brandSummary(view(many), brief())).toEqual(["4 references"]);
  });

  it("is empty when nothing is set up", () => {
    expect(brandSummary(view([]), brief())).toEqual([]);
  });
});

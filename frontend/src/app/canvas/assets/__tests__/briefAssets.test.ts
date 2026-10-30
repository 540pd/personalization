import { describe, expect, it } from "vitest";
import type { AssetView, BrandAssetsView } from "@/api/brandAssets.api";
import { briefLogo, briefProduct } from "../briefAssets";

const asset = (id: string, kind: AssetView["kind"], details: Record<string, string> = {}): AssetView => ({
  id, url: `/api/proxy/assets/${id}`, mimeType: "image/png", bytes: 1, source: "upload", createdAt: "", kind, name: `${id}.png`, description: "", details,
});

const view = (assets: AssetView[], record: Partial<BrandAssetsView["record"]> = {}): BrandAssetsView => ({
  revision: 1,
  updatedAt: null,
  record: {
    productName: "Trail shoe", sku: "", masterId: "", colours: { primary: "", secondary: "", accent: "" },
    assetIds: assets.map((a) => a.id),
    ...record,
  },
  assets,
});

describe("briefProduct (#444)", () => {
  const front = asset("front", "productImage");
  const side = asset("side", "productImage");

  it("is the saved master with the product's name and SKU", () => {
    const p = briefProduct(view([front, side], { masterId: "side", sku: "TRS-1" }));
    expect([p?.image.id, p?.name, p?.sku]).toEqual(["side", "Trail shoe", "TRS-1"]);
  });

  it("is null without a master, or with one the page has not saved", () => {
    expect(briefProduct(view([front]))).toBeNull();
    expect(briefProduct(view([front], { masterId: "front", assetIds: [] }))).toBeNull();
  });
});

describe("briefLogo (#444)", () => {
  const secondary = asset("second", "logo", { logoType: "Secondary logo" });
  const primary = asset("prime", "logo", { logoType: "Primary logo" });

  it("is the primary logo", () => {
    expect(briefLogo(view([secondary, primary]))).toMatchObject({ image: { id: "prime" }, type: "Primary logo" });
  });

  it("falls back to the first logo, with its own type", () => {
    expect(briefLogo(view([secondary]))).toMatchObject({ image: { id: "second" }, type: "Secondary logo" });
    expect(briefLogo(view([asset("bare", "logo")]))?.type).toBe("Logo");
  });

  it("is null without a saved logo", () => {
    expect(briefLogo(view([asset("p", "productImage")]))).toBeNull();
    expect(briefLogo(view([primary], { assetIds: [] }))).toBeNull();
  });
});

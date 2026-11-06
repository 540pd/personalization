import { describe, expect, it } from "vitest";
import type { AssetView, BrandAssetsView } from "@/api/brandAssets.api";
import { briefReferences, referenceSummary, togglePick } from "../briefReferences";

const asset = (id: string, details: Record<string, string>, kind: AssetView["kind"] = "reference"): AssetView => ({
  id, url: `/api/proxy/assets/${id}`, mimeType: "image/png", bytes: 1, source: "upload", createdAt: "", kind, name: `${id}.png`, description: "", details,
});

const view = (assets: AssetView[], assetIds = assets.map((a) => a.id)): BrandAssetsView => ({
  revision: 1,
  updatedAt: null,
  record: { productName: "", sku: "", masterId: "", colours: { primary: "", secondary: "", accent: "" }, assetIds },
  assets,
});

describe("briefReferences (#442)", () => {
  const street = asset("street", { referenceType: "Scene / environment", use: "inspiration", scope: "picked" });
  const sand = asset("sand", { referenceType: "Background", use: "asIs", scope: "always" });
  const logo = asset("logo", { logoType: "Primary logo" }, "logo");

  it("lists saved references only, in the page's order", () => {
    const refs = briefReferences(view([street, logo, sand]), []);
    expect(refs.map((r) => r.asset.id)).toEqual(["street", "sand"]);
    expect(refs.map((r) => [r.type, r.use])).toEqual([["Scene / environment", "inspiration"], ["Background", "asIs"]]);
  });

  it("leaves out a reference the Assets page has not saved", () => {
    expect(briefReferences(view([street, sand], ["sand"]), []).map((r) => r.asset.id)).toEqual(["sand"]);
  });

  it("puts Always references in use, and picked ones only when picked", () => {
    const refs = briefReferences(view([street, sand]), []);
    expect(refs.map((r) => [r.always, r.inUse])).toEqual([[false, false], [true, true]]);
    expect(briefReferences(view([street, sand]), ["street"])[0].inUse).toBe(true);
  });

  it("ignores a pick of a reference that has gone", () => {
    const refs = briefReferences(view([sand]), ["street"]);
    expect(refs).toHaveLength(1);
    expect(referenceSummary(refs)).toBe("1 always");
  });

  it("falls back to Other and Inspiration only for missing details", () => {
    const [r] = briefReferences(view([asset("x", {})]), []);
    expect([r.type, r.use, r.always]).toEqual(["Other", "inspiration", false]);
  });
});

describe("referenceSummary", () => {
  const street = asset("street", { scope: "picked" });
  const park = asset("park", { scope: "picked" });
  const sand = asset("sand", { scope: "always" });
  it("counts picked and always", () => {
    expect(referenceSummary(briefReferences(view([street, park, sand]), ["street", "park"]))).toBe("2 picked · 1 always");
    expect(referenceSummary(briefReferences(view([street]), ["street"]))).toBe("1 picked");
    expect(referenceSummary(briefReferences(view([street]), []))).toBe("None picked yet");
  });
});

describe("togglePick", () => {
  it("picks and unpicks", () => {
    expect(togglePick([], "a")).toEqual(["a"]);
    expect(togglePick(["a", "b"], "a")).toEqual(["b"]);
  });
});

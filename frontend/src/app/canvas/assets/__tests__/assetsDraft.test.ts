import { describe, expect, it } from "vitest";
import type { AssetView, BrandAssetsView } from "@/api/brandAssets.api";
import {
  addImage, addUploading, changedImages, draftFrom, editImage, isDirty, isDuplicate, isLowRes, isUploading, makeMaster, master,
  otherViews, recordOf, removeImage, saveProblems, uploadFailed, uploadRetried, uploaded,
} from "../assetsDraft";

// The Assets page's editing rules (#414).

const asset = (id: string, over: Partial<AssetView> = {}): AssetView => ({
  id, url: `/api/proxy/assets/${id}/content`, mimeType: "image/png", bytes: 10, source: "upload",
  createdAt: "2026-10-29T10:00:00Z", kind: "productImage", name: `${id}.png`, description: "", details: {}, ...over,
});
const view = (over: Partial<BrandAssetsView["record"]> = {}, assets: AssetView[] = []): BrandAssetsView => ({
  revision: 1, updatedAt: null, assets,
  record: { productName: "", sku: "", masterId: "", colours: { primary: "", secondary: "", accent: "" }, assetIds: assets.map((a) => a.id), ...over },
});

describe("assets draft (#414)", () => {
  it("loads the saved page, keeping assets of other kinds aside", async () => {
    const logo = asset("logo", { kind: "logo" });
    const d = draftFrom(view({ productName: "Shoe", masterId: "b" }, [asset("a"), asset("b"), logo]));
    expect(d.images.map((i) => i.asset.id)).toEqual(["a", "b"]);
    expect(master(d)?.asset.id).toBe("b");
    expect(otherViews(d).map((i) => i.asset.id)).toEqual(["a"]);
    expect(d.others).toEqual([logo]);
    // Others stay on the page when it is saved.
    expect(recordOf(d).assetIds).toEqual(["a", "b", "logo"]);
  });

  it("falls back to the first image when the saved master has gone", () => {
    expect(draftFrom(view({ masterId: "gone" }, [asset("a"), asset("b")])).masterId).toBe("a");
    expect(draftFrom(view()).masterId).toBe("");
  });

  it("makes the first image added the master, and later ones views", () => {
    let d = draftFrom(view());
    d = addImage(d, asset("a"));
    d = addImage(d, asset("b"));
    expect(d.masterId).toBe("a");
    expect(otherViews(d).map((i) => i.asset.id)).toEqual(["b"]);
  });

  it("moves the master badge, and hands it on when the master is removed", () => {
    let d = draftFrom(view({ masterId: "a" }, [asset("a"), asset("b"), asset("c")]));
    d = makeMaster(d, "c");
    expect(d.masterId).toBe("c");
    expect(makeMaster(d, "nope").masterId).toBe("c");
    d = removeImage(d, "c");
    expect(d.masterId).toBe("a");
    d = removeImage(removeImage(d, "a"), "b");
    expect(d.masterId).toBe("");
  });

  it("edits an image's description and details, and knows what changed", () => {
    const base = draftFrom(view({ masterId: "a", productName: "Shoe" }, [asset("a"), asset("b", { details: { view: "Side" } })]));
    let d = editImage(base, "b", { details: { imageType: "Packshot" } });
    d = editImage(d, "a", { description: "White shoe, side view" });
    expect(d.images[1].details).toEqual({ view: "Side", imageType: "Packshot" });
    expect(changedImages(d).map((i) => i.asset.id)).toEqual(["a", "b"]);
    expect(isDirty(d, base)).toBe(true);
    expect(isDirty(base, base)).toBe(false);
  });

  it("is dirty after any change to the record", () => {
    const base = draftFrom(view({ productName: "Shoe" }));
    expect(isDirty({ ...base, sku: "X" }, base)).toBe(true);
    expect(isDirty({ ...base, colours: { ...base.colours, primary: "#111111" } }, base)).toBe(true);
    expect(isDirty(addImage(base, asset("a")), base)).toBe(true);
  });

  it("blocks Save without a master image or a product name, with the doc's message", () => {
    const empty = draftFrom(view());
    expect(saveProblems(empty)).toEqual({ message: "Add a Master Product Image and Product Name before saving.", missingMaster: true, missingName: true });
    const named = { ...empty, productName: "  " };
    expect(saveProblems(named).missingName).toBe(true);
    const ready = addImage({ ...empty, productName: "Shoe" }, asset("a"));
    expect(saveProblems(ready)).toEqual({ message: null, missingMaster: false, missingName: false });
  });

  it("trims the record it saves", () => {
    const d = addImage({ ...draftFrom(view()), productName: "  Shoe ", sku: " X1 " }, asset("a"));
    expect(recordOf(d)).toMatchObject({ productName: "Shoe", sku: "X1", masterId: "a", assetIds: ["a"] });
  });

  describe("uploads in progress (#415)", () => {
    const file = { name: "side.png", type: "image/png", size: 10 };

    it("shows an upload at once, editable, and keeps what was typed when it lands", () => {
      let d = addUploading(draftFrom(view()), "tmp-1", file, "blob:local");
      expect(d.masterId).toBe("tmp-1");
      expect(master(d)?.asset.url).toBe("blob:local");
      expect(isUploading(d)).toBe(true);
      d = editImage(d, "tmp-1", { description: "Side view", details: { view: "Side" } });
      d = uploaded(d, "tmp-1", asset("a1", { name: "side.png" }));
      expect(isUploading(d)).toBe(false);
      expect(d.masterId).toBe("a1");
      expect(d.images[0]).toMatchObject({ asset: { id: "a1" }, description: "Side view", details: { view: "Side" } });
      expect(d.images[0].upload).toBeUndefined();
      // Typed while uploading: saved as the image's details.
      expect(changedImages(d).map((i) => i.asset.id)).toEqual(["a1"]);
    });

    it("never saves an image that has not landed, nor counts it as the master", () => {
      let d = addUploading({ ...draftFrom(view()), productName: "Shoe" }, "tmp-1", file, "blob:x");
      expect(recordOf(d)).toMatchObject({ masterId: "", assetIds: [] });
      expect(saveProblems(d).missingMaster).toBe(true);
      expect(isDirty(d, draftFrom(view()))).toBe(true);
      d = uploadFailed(d, "tmp-1", "Too large to upload (25 MB at most).");
      expect(d.images[0].upload).toEqual({ state: "failed", error: "Too large to upload (25 MB at most)." });
      expect(isUploading(d)).toBe(false);
      d = uploadRetried(d, "tmp-1");
      expect(d.images[0].upload).toEqual({ state: "uploading" });
    });

    it("flags an image under 1500 px on its longest side", () => {
      expect(isLowRes({ width: 640, height: 480 })).toBe(true);
      expect(isLowRes({ width: 1200, height: 1600 })).toBe(false);
      expect(isLowRes({ width: 1500, height: 900 })).toBe(false);
      expect(isLowRes(undefined)).toBe(false);
    });

    it("spots a duplicate by content this visit, or by name and size for a stored one", () => {
      const d = draftFrom(view({}, [asset("a1", { name: "side.png", bytes: 10 })]));
      const hashes = new Map([["a1", "h1"]]);
      expect(isDuplicate(d, { name: "other.png", size: 99 }, "h1", hashes)).toBe(true);
      expect(isDuplicate(d, { name: "side.png", size: 10 }, "h2", new Map())).toBe(true);
      expect(isDuplicate(d, { name: "side.png", size: 11 }, "h2", new Map())).toBe(false);
    });
  });
});

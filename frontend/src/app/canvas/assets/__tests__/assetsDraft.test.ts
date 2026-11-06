import { describe, expect, it } from "vitest";
import type { AssetView, BrandAssetsView } from "@/api/brandAssets.api";
import {
  addImage, addUploading, changedImages, draftFrom, editImage, imagesOf, isDirty, isDuplicate, isLowRes, isUploading, makeMaster,
  master, otherViews, recordOf, removeImage, replaceImage, readiness, saveProblems, setReferenceType, defaultUse, uploadFailed, uploadRetried, uploaded, cleanColour, isColour,
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
    const logo = asset("logo", { kind: null });
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
    expect(saveProblems(empty)).toEqual({ message: "Add a Master Product Image and Product Name before saving.", missingMaster: true, missingName: true, missingLogo: false, badColours: [] });
    const named = { ...empty, productName: "  " };
    expect(saveProblems(named).missingName).toBe(true);
    const ready = addImage({ ...empty, productName: "Shoe" }, asset("a"));
    expect(saveProblems(ready)).toEqual({ message: null, missingMaster: false, missingName: false, missingLogo: false, badColours: [] });
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

describe("creatives to adapt from and style examples (#416)", () => {
  const file = { name: "spring-kv.final.png", type: "image/png", size: 10 };

  it("loads them beside the product images, apart from the master and views", () => {
    const d = draftFrom(view({ masterId: "a" }, [asset("k", { kind: "adaptFrom" }), asset("a"), asset("s", { kind: "styleExample" })]));
    expect(d.images.map((i) => i.asset.id)).toEqual(["k", "a", "s"]);
    expect(d.others).toEqual([]);
    expect(imagesOf(d, "adaptFrom").map((i) => i.asset.id)).toEqual(["k"]);
    expect(imagesOf(d, "styleExample").map((i) => i.asset.id)).toEqual(["s"]);
    expect(otherViews(d)).toEqual([]);
    expect(recordOf(d).assetIds).toEqual(["k", "a", "s"]);
  });

  it("never makes one the master, nor falls back to one", () => {
    let d = draftFrom(view({}, [asset("k", { kind: "adaptFrom" })]));
    expect(d.masterId).toBe("");
    d = addUploading(d, "t1", file, "blob:1", "styleExample");
    d = addImage(d, asset("k2", { kind: "adaptFrom" }));
    expect(d.masterId).toBe("");
    expect(makeMaster(d, "k").masterId).toBe("");
    d = addImage(d, asset("a"));
    d = addImage(d, asset("b"));
    // Removing the master hands the badge to the next product image, skipping the others.
    expect(removeImage(d, "a").masterId).toBe("b");
  });

  it("names a new one after its file, kept when it lands and saved as a change", () => {
    let d = addUploading(draftFrom(view()), "t1", file, "blob:1", "adaptFrom");
    expect(d.images[0].details).toEqual({ name: "spring-kv.final" });
    d = editImage(d, "t1", { details: { name: "Spring key visual", aspectRatio: "16:9" } });
    d = uploaded(d, "t1", asset("k", { kind: "adaptFrom", name: file.name }));
    expect(d.images[0].details).toEqual({ name: "Spring key visual", aspectRatio: "16:9" });
    expect(changedImages(d).map((i) => i.asset.id)).toEqual(["k"]);
    // A product image starts with no details.
    expect(addUploading(draftFrom(view()), "t2", file, "blob:2").images[0].details).toEqual({});
  });

  it("spots a duplicate only among images of the same kind", () => {
    const d = draftFrom(view({}, [asset("a", { name: "x.png", bytes: 5 })]));
    expect(isDuplicate(d, { name: "x.png", size: 5 }, "h", new Map())).toBe(true);
    expect(isDuplicate(d, { name: "x.png", size: 5 }, "h", new Map(), "styleExample")).toBe(false);
  });
});

describe("logos and colours (#417)", () => {
  const png = { name: "wordmark.png", type: "image/png", size: 10 };
  const ready = (assets: AssetView[] = []) =>
    draftFrom(view({ productName: "Shoe", masterId: "a" }, [asset("a"), ...assets]));

  it("makes the first logo the primary, used by default, and later ones secondary", () => {
    let d = addUploading(ready(), "t1", png, "blob:1", "logo");
    d = addUploading(d, "t2", { ...png, name: "symbol.png" }, "blob:2", "logo");
    expect(imagesOf(d, "logo").map((i) => i.details)).toEqual([
      { logoType: "Primary logo", usage: "By default" },
      { logoType: "Secondary logo" },
    ]);
    expect(d.masterId).toBe("a");
  });

  it("asks for a logo only when the brief makes it mandatory, and not one still uploading", () => {
    const none = ready();
    expect(saveProblems(none).message).toBeNull();
    const required = saveProblems(none, { logoRequired: true });
    expect(required.missingLogo).toBe(true);
    expect(required.message).toBe("Add a Primary Logo because Logo is marked as mandatory in the Campaign Brief.");
    const uploading = addUploading(none, "t1", png, "blob:1", "logo");
    expect(saveProblems(uploading, { logoRequired: true }).missingLogo).toBe(true);
    const stored = ready([asset("l", { kind: "logo" })]);
    expect(saveProblems(stored, { logoRequired: true }).message).toBeNull();
    // Both messages together.
    expect(saveProblems(draftFrom(view()), { logoRequired: true }).message).toBe(
      "Add a Master Product Image and Product Name before saving. Add a Primary Logo because Logo is marked as mandatory in the Campaign Brief.",
    );
  });

  it("replaces a logo in place, keeping its details, and sends the change", () => {
    const d0 = ready([asset("l", { kind: "logo", description: "Black wordmark", details: { logoType: "Primary logo" } })]);
    let d = replaceImage(d0, "l", "t1", png, "blob:1");
    expect(imagesOf(d, "logo")).toHaveLength(1);
    expect(imagesOf(d, "logo")[0]).toMatchObject({ description: "Black wordmark", details: { logoType: "Primary logo" }, upload: { state: "uploading" } });
    expect(recordOf(d).assetIds).toEqual(["a"]);
    d = uploaded(d, "t1", asset("l2", { kind: "logo" }));
    expect(recordOf(d).assetIds).toEqual(["a", "l2"]);
    expect(changedImages(d).map((i) => i.asset.id)).toEqual(["l2"]);
  });

  it("reads colours as hex values, and blocks Save on one that isn't", () => {
    expect(cleanColour(" 1a2b3c ")).toBe("#1A2B3C");
    expect(cleanColour("#abcdef")).toBe("#ABCDEF");
    expect(cleanColour("")).toBe("");
    expect(cleanColour("red")).toBe("red");
    expect(isColour("")).toBe(true);
    expect(isColour("#12345")).toBe(false);
    const d = { ...ready(), colours: { primary: "1a2b3c", secondary: "nope", accent: "" } };
    expect(saveProblems(d).badColours).toEqual(["secondary"]);
    expect(saveProblems(d).message).toBe("Use hex values like #1A2B3C for the brand colours.");
    expect(recordOf({ ...d, colours: { ...d.colours, secondary: "" } }).colours).toEqual({ primary: "#1A2B3C", secondary: "", accent: "" });
  });
});

describe("creative references (#418)", () => {
  const png = { name: "street.png", type: "image/png", size: 10 };

  it("starts a new reference as a scene, for inspiration, used when a campaign picks it", () => {
    const d = addUploading(draftFrom(view()), "t1", png, "blob:1", "reference");
    expect(imagesOf(d, "reference")[0].details).toEqual({ referenceType: "Scene / environment", use: "inspiration", scope: "picked" });
    expect(d.masterId).toBe("");
  });

  it("sets How to use it to the type's default when the type changes; a later choice is kept", () => {
    expect(defaultUse("Background")).toBe("asIs");
    expect(defaultUse("Texture / pattern")).toBe("asIs");
    expect(defaultUse("Mood board")).toBe("inspiration");
    let d = draftFrom(view({}, [asset("r", { kind: "reference", details: { referenceType: "Scene / environment", use: "inspiration", scope: "always" } })]));
    d = setReferenceType(d, "r", "Background");
    expect(d.images[0].details).toEqual({ referenceType: "Background", use: "asIs", scope: "always" });
    d = editImage(d, "r", { details: { use: "inspiration" } });
    expect(d.images[0].details.use).toBe("inspiration");
    d = setReferenceType(d, "r", "Lighting");
    expect(d.images[0].details.use).toBe("inspiration");
    expect(setReferenceType(d, "r", "").images[0].details).toMatchObject({ referenceType: "", use: "" });
  });
});

describe("readiness (#419)", () => {
  const states = (d: Parameters<typeof readiness>[0], logoRequired = false) =>
    readiness(d, { logoRequired }).map((i) => [i.label, i.state]);

  it("says what is missing, what is optional, and what is done, as the page is now", () => {
    const empty = draftFrom(view());
    expect(states(empty, true)).toEqual([
      ["Master image", "missing"],
      ["Product name", "missing"],
      ["Logo (required by the brief)", "missing"],
      ["Colours 0 of 3", "optional"],
    ]);
    expect(states(empty)[2]).toEqual(["Logo (optional)", "optional"]);

    let d = addImage({ ...empty, productName: "Shoe", colours: { primary: "#1A2B3C", secondary: "nope", accent: "" } }, asset("a"));
    d = addImage(d, asset("l", { kind: "logo" }));
    expect(states(d, true)).toEqual([
      ["Master image", "done"],
      ["Product name", "done"],
      ["Logo (required by the brief)", "done"],
      ["Colours 1 of 3", "done"],
    ]);
  });

  it("doesn't count an image still uploading", () => {
    const d = addUploading(draftFrom(view()), "t1", { name: "a.png", type: "image/png", size: 1 }, "blob:1");
    expect(readiness(d)[0].state).toBe("missing");
  });
});

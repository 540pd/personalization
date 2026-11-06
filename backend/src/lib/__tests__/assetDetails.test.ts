import { describe, expect, it } from "vitest";
import { ASSET_KINDS, DETAIL_FIELDS, cleanFileName, detailsError, isAssetKind } from "../assets/details.js";

// The kinds and details the Assets page stores with a file (#412).

describe("asset details", () => {
  it("knows the five kinds", () => {
    expect(ASSET_KINDS).toEqual(["productImage", "logo", "adaptFrom", "styleExample", "reference"]);
    expect(isAssetKind("logo")).toBe(true);
    expect(isAssetKind("font")).toBe(false);
    expect(isAssetKind(3)).toBe(false);
  });

  it("accepts each kind's own fields, options and short text", () => {
    expect(detailsError("productImage", { imageType: "Hero creative", view: "3/4 angle", variant: "White / orange" })).toBeNull();
    expect(detailsError("logo", { logoType: "Primary logo", usage: "On dark backgrounds" })).toBeNull();
    expect(detailsError("adaptFrom", { name: "Spring key visual", creativeType: "Campaign key visual", aspectRatio: "16:9" })).toBeNull();
    expect(detailsError("styleExample", { name: "Post", exampleType: "Typography reference" })).toBeNull();
    expect(detailsError("reference", { referenceType: "Background", use: "asIs", scope: "always" })).toBeNull();
    // Every field optional, and an empty string clears one.
    expect(detailsError("reference", {})).toBeNull();
    expect(detailsError("logo", { usage: "" })).toBeNull();
  });

  it("refuses a field the kind lacks, an unknown option, non-text and long text", () => {
    expect(detailsError("logo", { view: "Front" })).toMatch(/has no "view"/);
    expect(detailsError("productImage", { view: "Underneath" })).toMatch(/must be one of/);
    expect(detailsError("reference", { use: true })).toMatch(/must be text/);
    expect(detailsError("productImage", { variant: "x".repeat(201) })).toMatch(/up to 200/);
    expect(detailsError("logo", ["a"])).toMatch(/must be an object/);
    expect(detailsError(null, { view: "Front" })).toMatch(/kind before its details/);
    expect(detailsError(null, {})).toBeNull();
  });

  it("lists options for every choice field", () => {
    for (const fields of Object.values(DETAIL_FIELDS)) {
      for (const options of Object.values(fields)) if (options) expect(options.length).toBeGreaterThan(1);
    }
  });

  it("keeps only a file's own name, cleaned and capped", () => {
    expect(cleanFileName("C:\\\\Users\\\\me\\\\logo.png")).toBe("logo.png");
    expect(cleanFileName("../../etc/brand logo.png")).toBe("brand logo.png");
    expect(cleanFileName("  a\u0007b.png ")).toBe("ab.png");
    expect(cleanFileName("x".repeat(300))).toHaveLength(200);
    expect(cleanFileName(undefined)).toBe("");
  });
});

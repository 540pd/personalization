import { describe, expect, it, vi } from "vitest";

// When storing a generated file fails, its output is not lost (#323).

vi.mock("../assetService.js", () => ({
  saveAsset: vi.fn().mockRejectedValue(new Error("bucket unavailable")),
}));

import { storeGenerated } from "../generatedAssets.js";

describe("storeGenerated", () => {
  it("answers the data: URL itself when the store fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const url = "data:image/png;base64,AAAA";
    expect(await storeGenerated("ana@accenture.com", url)).toBe(url);
  });

  it("does not store a type assets do not hold", async () => {
    const url = "data:image/svg+xml;base64,PHN2Zy8+";
    expect(await storeGenerated("ana@accenture.com", url)).toBe(url);
  });
});

import { describe, it, expect } from "vitest";
import { buildContentParts } from "../imagen.js";

const png = (data: string) => `data:image/png;base64,${data}`;

describe("buildContentParts", () => {
  it("puts the instruction last when there are no references", () => {
    expect(buildContentParts("draw a cat")).toEqual([{ text: "draw a cat" }]);
  });

  it("names each reference immediately before its own image", () => {
    const parts = buildContentParts("put the logo on the mug", [
      { url: png("AAA"), name: "sunset" },
      { url: png("BBB"), name: "logo" },
    ]);
    expect(parts).toEqual([
      { text: 'Reference "sunset":' },
      { inlineData: { mimeType: "image/png", data: "AAA" } },
      { text: 'Reference "logo":' },
      { inlineData: { mimeType: "image/png", data: "BBB" } },
      { text: "put the logo on the mug" },
    ]);
  });

  it("keeps a name adjacent to its image rather than listing names up front", () => {
    const parts = buildContentParts("x", [
      { url: png("AAA"), name: "first" },
      { url: png("BBB"), name: "second" },
    ]);
    // The part following each name must be that name's image, otherwise the
    // model is back to mapping names to images by position.
    const firstIdx = parts.findIndex((p) => p.text === 'Reference "first":');
    const secondIdx = parts.findIndex((p) => p.text === 'Reference "second":');
    expect(parts[firstIdx + 1].inlineData?.data).toBe("AAA");
    expect(parts[secondIdx + 1].inlineData?.data).toBe("BBB");
  });

  it("falls back to a positional name so every reference stays addressable", () => {
    const parts = buildContentParts("x", [
      { url: png("AAA") },
      { url: png("BBB"), name: "logo" },
      { url: png("CCC"), name: "   " },
    ]);
    expect(parts.filter((p) => p.text).map((p) => p.text)).toEqual([
      'Reference "Reference 1":',
      'Reference "logo":',
      'Reference "Reference 3":',
      "x",
    ]);
  });

  it("skips entries that are not data URLs without shifting the others", () => {
    const parts = buildContentParts("x", [
      { url: "https://example.com/not-a-data-url.png", name: "remote" },
      { url: png("BBB"), name: "local" },
    ]);
    expect(parts).toEqual([
      { text: 'Reference "local":' },
      { inlineData: { mimeType: "image/png", data: "BBB" } },
      { text: "x" },
    ]);
  });

  it("preserves the declared mime type", () => {
    const parts = buildContentParts("x", [
      { url: "data:image/jpeg;base64,ZZZ", name: "photo" },
    ]);
    expect(parts[1].inlineData).toEqual({ mimeType: "image/jpeg", data: "ZZZ" });
  });
});

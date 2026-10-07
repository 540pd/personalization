import { describe, it, expect } from "vitest";
import { buildContentParts, type ContentPart } from "../prompt.js";

const png = (data: string) => `data:image/png;base64,${data}`;

describe("buildContentParts", () => {
  it("puts the instruction last when there are no references", () => {
    expect(buildContentParts("draw a cat")).toEqual([{ text: "draw a cat" }]);
  });

  it("names each reference immediately before its own image", () => {
    const parts = buildContentParts("put the logo on the mug", [
      { kind: "image" as const, url: png("AAA"), name: "sunset" },
      { kind: "image" as const, url: png("BBB"), name: "logo" },
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
      { kind: "image" as const, url: png("AAA"), name: "first" },
      { kind: "image" as const, url: png("BBB"), name: "second" },
    ]);
    // The part following each name must be that name's image, otherwise the
    // model is back to mapping names to images by position.
    const firstIdx = parts.findIndex((p: ContentPart) => p.text === 'Reference "first":');
    const secondIdx = parts.findIndex((p: ContentPart) => p.text === 'Reference "second":');
    expect(parts[firstIdx + 1].inlineData?.data).toBe("AAA");
    expect(parts[secondIdx + 1].inlineData?.data).toBe("BBB");
  });

  it("falls back to a positional name so every reference stays addressable", () => {
    const parts = buildContentParts("x", [
      { kind: "image" as const, url: png("AAA") },
      { kind: "image" as const, url: png("BBB"), name: "logo" },
      { kind: "image" as const, url: png("CCC"), name: "   " },
    ]);
    expect(parts.filter((p: ContentPart) => p.text).map((p: ContentPart) => p.text)).toEqual([
      'Reference "Reference 1":',
      'Reference "logo":',
      'Reference "Reference 3":',
      "x",
    ]);
  });

  it("skips entries that are not data URLs without shifting the others", () => {
    const parts = buildContentParts("x", [
      { kind: "image" as const, url: "https://example.com/not-a-data-url.png", name: "remote" },
      { kind: "image" as const, url: png("BBB"), name: "local" },
    ]);
    expect(parts).toEqual([
      { text: 'Reference "local":' },
      { inlineData: { mimeType: "image/png", data: "BBB" } },
      { text: "x" },
    ]);
  });

  it("preserves the declared mime type", () => {
    const parts = buildContentParts("x", [
      { kind: "image" as const, url: "data:image/jpeg;base64,ZZZ", name: "photo" },
    ]);
    expect(parts[1].inlineData).toEqual({ mimeType: "image/jpeg", data: "ZZZ" });
  });

  // --- text references -----------------------------------------------------

  it("carries a text reference as one named part", () => {
    const parts = buildContentParts("summarise it", [
      { kind: "text", text: "the harbour at dusk", name: "scene" },
    ]);
    expect(parts).toEqual([
      { text: 'Reference "scene": the harbour at dusk' },
      { text: "summarise it" },
    ]);
  });

  it("keeps image and text references in their declared order", () => {
    const parts = buildContentParts("combine them", [
      { kind: "image", url: png("AAA"), name: "photo" },
      { kind: "text", text: "warm, golden", name: "mood" },
      { kind: "image", url: png("BBB"), name: "logo" },
    ]);
    expect(parts).toEqual([
      { text: 'Reference "photo":' },
      { inlineData: { mimeType: "image/png", data: "AAA" } },
      { text: 'Reference "mood": warm, golden' },
      { text: 'Reference "logo":' },
      { inlineData: { mimeType: "image/png", data: "BBB" } },
      { text: "combine them" },
    ]);
  });

  it("gives an unnamed text reference the same positional fallback", () => {
    const parts = buildContentParts("x", [
      { kind: "image", url: png("AAA"), name: "photo" },
      { kind: "text", text: "some notes" },
    ]);
    expect(parts[2]).toEqual({ text: 'Reference "Reference 2": some notes' });
  });

  it("skips an empty text reference without shifting the others", () => {
    const parts = buildContentParts("x", [
      { kind: "text", text: "   ", name: "blank" },
      { kind: "text", text: "kept", name: "second" },
    ]);
    expect(parts).toEqual([
      { text: 'Reference "second": kept' },
      { text: "x" },
    ]);
  });
});

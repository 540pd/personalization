import { describe, it, expect } from "vitest";
import { composePrompt, referenceImages } from "../veo.js";
import type { VideoGenerationParams } from "../types.js";

const base: VideoGenerationParams = {
  modelId: "veo-3.1-lite-generate-001",
  instruction: "a harbour at dusk",
  userId: "u@example.com",
};
const png = (d: string) => `data:image/png;base64,${d}`;

describe("composePrompt", () => {
  it("returns the instruction unchanged with no references", () => {
    expect(composePrompt(base)).toBe("a harbour at dusk");
  });

  // Veo takes one prompt string, not an interleaved parts array, so a text
  // reference used to be dropped silently while the canvas showed a wire.
  it("folds a named text reference into the prompt", () => {
    const out = composePrompt({
      ...base,
      references: [{ kind: "text", text: "warm, golden light", name: "mood" }],
    });
    expect(out).toBe('Reference "mood": warm, golden light\n\na harbour at dusk');
  });

  it("keeps several text references in order, instruction last", () => {
    const out = composePrompt({
      ...base,
      references: [
        { kind: "text", text: "golden", name: "mood" },
        { kind: "text", text: "slow pan", name: "camera" },
      ],
    });
    expect(out).toBe(
      'Reference "mood": golden\nReference "camera": slow pan\n\na harbour at dusk'
    );
  });

  it("names an unnamed reference by position, as buildContentParts does", () => {
    const out = composePrompt({ ...base, references: [{ kind: "text", text: "notes" }] });
    expect(out).toContain('Reference "Reference 1": notes');
  });

  it("ignores image references and empty text", () => {
    const out = composePrompt({
      ...base,
      references: [
        { kind: "image", url: png("AAA"), name: "photo" },
        { kind: "text", text: "   ", name: "blank" },
      ],
    });
    expect(out).toBe("a harbour at dusk");
  });
});

describe("referenceImages", () => {
  it("returns every inline image, in wiring order", () => {
    const out = referenceImages({
      ...base,
      references: [
        { kind: "image", url: png("AAA"), name: "one" },
        { kind: "text", text: "ignored" },
        { kind: "image", url: "data:image/jpeg;base64,BBB", name: "two" },
      ],
    });
    // Only the first used to survive; a second image node was dropped silently.
    expect(out).toEqual([
      { mimeType: "image/png", imageBytes: "AAA" },
      { mimeType: "image/jpeg", imageBytes: "BBB" },
    ]);
  });

  it("skips anything that is not a data URL", () => {
    const out = referenceImages({
      ...base,
      references: [{ kind: "image", url: "https://example.com/x.png", name: "remote" }],
    });
    expect(out).toEqual([]);
  });
});

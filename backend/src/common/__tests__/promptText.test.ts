import { describe, expect, it } from "vitest";
import { cleanPromptName, MAX_PROMPT_NAME } from "../promptText.js";

describe("cleanPromptName (#303)", () => {
  it("turns control characters into spaces and collapses every whitespace run", () => {
    expect(cleanPromptName("Hero  shot")).toBe("Hero shot");
    expect(cleanPromptName("Hero\tshot\nwide")).toBe("Hero shot wide");
    expect(cleanPromptName("Hel\u0000met\u001F\u007F x")).toBe("Hel met x");
  });

  it("trims, and bounds the name", () => {
    expect(cleanPromptName("  kite  ")).toBe("kite");
    expect(cleanPromptName("x".repeat(100))).toHaveLength(MAX_PROMPT_NAME);
  });

  it("leaves nothing of a name that was only whitespace and controls", () => {
    expect(cleanPromptName("\u0007 \t\n")).toBe("");
  });
});

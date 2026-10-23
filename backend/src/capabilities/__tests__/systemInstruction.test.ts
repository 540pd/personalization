import { describe, expect, it } from "vitest";
import { buildSystemInstruction } from "../prompt.js";

describe("buildSystemInstruction (#239)", () => {
  it("is undefined with no agent and no skills", () => {
    expect(buildSystemInstruction()).toBeUndefined();
    expect(buildSystemInstruction(undefined, [{ name: "empty", content: "  " }])).toBeUndefined();
  });

  it("puts the agent's instructions first, then each skill under its heading", () => {
    const system = buildSystemInstruction({ name: "copywriter", instructions: " Write three options. " }, [
      { name: "brand-voice", content: "Warm and direct." },
      { name: "campaign-brief", content: "Spring launch." },
    ]);
    expect(system).toBe(
      "Write three options.\n\n" +
        "The prompt names these skills with @. Follow each one.\n\n" +
        "## Skill: brand-voice\n\nWarm and direct.\n\n" +
        "## Skill: campaign-brief\n\nSpring launch.",
    );
  });

  it("works with skills alone", () => {
    expect(buildSystemInstruction(undefined, [{ name: "tone", content: "Calm." }])).toMatch(/^The prompt names/);
  });
});

import { describe, expect, it } from "vitest";
import { buildSystemInstruction, withSkills } from "../prompt.js";

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

describe("withSkills (#240)", () => {
  it("leaves a prompt with no skills as it is", () => {
    expect(withSkills("a cat")).toBe("a cat");
    expect(withSkills("a cat", [{ name: "x", content: " " }])).toBe("a cat");
  });

  it("puts each skill first under its heading, then the prompt", () => {
    expect(withSkills("a cat in @tone", [{ name: "tone", content: " Calm. " }])).toBe(
      "## Skill: tone\n\nCalm.\n\n## Prompt\n\na cat in @tone",
    );
  });
});

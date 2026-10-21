import { describe, expect, it } from "vitest";
import {
  activeMention,
  findMentions,
  insertMention,
  mentionContext,
  mentionNotes,
  menuItems,
  menuKey,
  resolveMentions,
  type MentionAgent,
  type MentionSkill,
} from "../mentions";

const skill = (id: string, name: string, content = `# ${name}\nBody of ${name}.`, description = ""): MentionSkill => ({
  id, name, description, tags: [], content,
});
const agent = (id: string, name: string, skillIds: string[] = [], model = "gemini-3.8-flash"): MentionAgent => ({
  id, name, description: "", tags: [], instructions: `You are ${name}.`, model, skillIds,
});

const skills = [
  skill("s1", "brand-voice", "---\nname: brand-voice\n---\nWarm, direct.", "Warm, direct copy"),
  skill("s2", "campaign-brief", "Spring launch.", "Key messages"),
  skill("s3", "tone", "Calm."),
];
const agents = [agent("a1", "copywriter", ["s3", "s1"]), agent("a2", "planner")];

describe("findMentions", () => {
  it("finds handles at the start or after whitespace, not inside a word", () => {
    expect(findMentions("@brand-voice and a@b.com\n@Tone.")).toEqual([
      { start: 0, end: 12, handle: "brand-voice" },
      { start: 25, end: 30, handle: "tone" },
    ]);
  });

  it("ends a handle before trailing punctuation or a trailing hyphen", () => {
    expect(findMentions("use @brand-voice, then @x-").map((m) => m.handle)).toEqual(["brand-voice", "x"]);
  });
});

describe("activeMention", () => {
  it("is the @ and what follows it, up to the caret", () => {
    expect(activeMention("hi @br", 6)).toEqual({ start: 3, query: "br" });
    expect(activeMention("@", 1)).toEqual({ start: 0, query: "" });
  });

  it("is null inside a word, after a space, or with no @", () => {
    expect(activeMention("a@b", 3)).toBeNull();
    expect(activeMention("@br and", 7)).toBeNull();
    expect(activeMention("plain", 5)).toBeNull();
  });
});

describe("menuItems", () => {
  const lib = { skills, agents };
  const names = (q: string, scope: "skills" | "skills-and-agents" = "skills-and-agents") =>
    menuItems(q, lib, scope).map((i) => `${i.kind}:${i.name}`);

  it("narrows on handle or description, A–Z, skills before agents", () => {
    expect(names("")).toEqual([
      "skill:brand-voice", "skill:campaign-brief", "skill:tone", "agent:copywriter", "agent:planner",
    ]);
    expect(names("BR")).toEqual(["skill:brand-voice", "skill:campaign-brief"]);
    expect(names("key")).toEqual(["skill:campaign-brief"]);
  });

  it("offers agents only where asked, and carries the agent for the pick", () => {
    expect(names("", "skills")).toEqual(["skill:brand-voice", "skill:campaign-brief", "skill:tone"]);
    const rows = menuItems("copy", lib, "skills-and-agents");
    expect(rows).toEqual([
      { kind: "skill", id: "s1", name: "brand-voice", description: "Warm, direct copy" },
      { kind: "agent", id: "a1", name: "copywriter", description: "", agent: agents[0] },
    ]);
  });
});

describe("menuKey", () => {
  it("moves the highlight with the arrows, wrapping both ways", () => {
    expect(menuKey("ArrowDown", false, 0, 3)).toBe(1);
    expect(menuKey("ArrowDown", false, 2, 3)).toBe(0);
    expect(menuKey("ArrowUp", false, 0, 3)).toBe(2);
  });

  it("picks on Enter or Tab, but not with Shift or with nothing to pick", () => {
    expect(menuKey("Enter", false, 1, 3)).toBe("pick");
    expect(menuKey("Tab", false, 1, 3)).toBe("pick");
    expect(menuKey("Enter", true, 1, 3)).toBeNull();
    expect(menuKey("Enter", false, 0, 0)).toBeNull();
  });

  it("leaves the arrows to the textarea when the menu is empty", () => {
    expect(menuKey("ArrowDown", false, 0, 0)).toBeNull();
  });

  it("dismisses on Escape, even when empty, and ignores other keys", () => {
    expect(menuKey("Escape", false, 0, 0)).toBe("dismiss");
    expect(menuKey("a", false, 0, 3)).toBeNull();
  });
});

describe("insertMention", () => {
  it("replaces the @query with the handle and a space, caret after it", () => {
    expect(insertMention("in @br", 3, "brand-voice")).toEqual({
      text: "in @brand-voice ", caret: 16, from: 3, to: 6, insert: "@brand-voice ",
    });
  });

  it("replaces the whole word, and doesn't double a space", () => {
    expect(insertMention("@brxx tomorrow", 0, "brand-voice")).toMatchObject({ text: "@brand-voice tomorrow", caret: 13, to: 6 });
  });
});

describe("resolveMentions", () => {
  it("takes named skills, then the agent's own, each once", () => {
    const r = resolveMentions("@copywriter in @brand-voice and @campaign-brief", { skills, agents }, "skills-and-agents");
    expect(r.agent?.name).toBe("copywriter");
    expect(r.skills.map((s) => s.name)).toEqual(["brand-voice", "campaign-brief", "tone"]);
    expect(r.known.map((m) => m.handle)).toEqual(["copywriter", "brand-voice", "campaign-brief"]);
    expect(r.unknown).toEqual([]);
  });

  it("uses the first agent; later ones and unknown handles are notes, once each", () => {
    const r = resolveMentions("@copywriter @planner @nope @nope @planner", { skills, agents }, "skills-and-agents");
    expect(r.agent?.name).toBe("copywriter");
    expect(r.extraAgents).toEqual(["planner"]);
    expect(r.unknown).toEqual(["nope"]);
    expect(mentionNotes(r)).toEqual([
      "@nope isn't in your skills or agents, so it's sent as text.",
      "One agent per prompt: @planner is sent as text.",
    ]);
  });

  it("offers no agent in a skills-only panel, with a note", () => {
    const r = resolveMentions("@copywriter in @tone", { skills, agents }, "skills");
    expect(r.agent).toBeUndefined();
    expect(r.skills.map((s) => s.name)).toEqual(["tone"]);
    expect(mentionNotes(r)).toEqual(["Agents work in Prompt panels: @copywriter is sent as text."]);
  });

  it("lets an agent win over a skill of the same handle", () => {
    const r = resolveMentions("@copywriter", { skills: [skill("x", "copywriter")], agents }, "skills-and-agents");
    expect(r.agent?.id).toBe("a1");
    // Its own skills aren't in this library, and the same-named skill isn't sent.
    expect(r.skills).toEqual([]);
  });
});

describe("mentionContext", () => {
  it("sends the agent's instructions and skill bodies without front matter", () => {
    const r = resolveMentions("@copywriter", { skills, agents }, "skills-and-agents");
    expect(mentionContext(r)).toEqual({
      agent: { name: "copywriter", instructions: "You are copywriter." },
      skills: [
        { name: "tone", content: "Calm." },
        { name: "brand-voice", content: "Warm, direct." },
      ],
    });
  });

  it("is undefined when the prompt names nothing", () => {
    expect(mentionContext(resolveMentions("plain @nope", { skills, agents }, "skills-and-agents"))).toBeUndefined();
  });
});

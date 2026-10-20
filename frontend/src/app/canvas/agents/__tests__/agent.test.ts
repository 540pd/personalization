import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AGENT_MODELS,
  DEFAULT_AGENT_MODEL,
  EXAMPLE_AGENT_FILE,
  agentFileNotes,
  agentSkills,
  agentSummary,
  listNames,
  matchModel,
  modelLabel,
  readAgentFile,
} from "../agent";
import { AGENTS_STORAGE_KEY, loadAgents, saveAgents, type Agent } from "@/store/agents.store";

function memoryStorage(failWrites = false): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() { return data.size; },
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    removeItem: (k) => { data.delete(k); },
    setItem: (k, v) => {
      if (failWrites) throw new DOMException("quota", "QuotaExceededError");
      data.set(k, v);
    },
  };
}

const agent: Agent = {
  id: "agent-1", name: "copywriter", description: "Taglines", instructions: "Write three.",
  model: "gemini-3.8-flash", skillIds: ["s2", "gone", "s1"], tags: ["copy"],
  fileName: "copywriter.md", size: 40, content: "---\nname: Copywriter\n---\nWrite three.", createdAt: 1,
};

const skills = [
  { id: "s1", name: "brand-voice", description: "", tags: [] },
  { id: "s2", name: "campaign-brief", description: "", tags: [] },
];

afterEach(() => vi.restoreAllMocks());

describe("models", () => {
  it("offers the Prompt panel's models, defaulting to its default", () => {
    expect(AGENT_MODELS.map((m) => m.id)).toContain(DEFAULT_AGENT_MODEL);
    expect(DEFAULT_AGENT_MODEL).toBe("gemini-3.5-flash-lite");
  });

  it("labels a model, and a retired one as the default", () => {
    expect(modelLabel("gemini-3.8-flash")).toBe("Gemini 3.8 Flash");
    expect(modelLabel("gemini-1.0-old")).toBe("Gemini 3.5 Flash Lite");
  });

  it("matches a model by id or label, ignoring case", () => {
    expect(matchModel("GEMINI-3.8-FLASH")).toBe("gemini-3.8-flash");
    expect(matchModel(" gemini 3.8 flash ")).toBe("gemini-3.8-flash");
    expect(matchModel("gemini-9")).toBeUndefined();
  });
});

describe("readAgentFile", () => {
  it("reads every field the front matter can set", () => {
    const text =
      "---\nname: Copywriter\ndescription: Taglines\nmodel: Gemini 3.8 Flash\nskills: [campaign brief, Brand voice]\ntags: [Copy, social media]\n---\n\nWrite three.\n";
    expect(readAgentFile(text, "c.md", skills)).toEqual({
      name: "copywriter",
      description: "Taglines",
      tags: ["copy", "social-media"],
      instructions: "Write three.",
      model: "gemini-3.8-flash",
      skillIds: ["s2", "s1"],
      unknownModel: undefined,
      missingSkills: [],
    });
  });

  it("matches skills as handles, and words a missing one as the file wrote it (#237)", () => {
    const file = readAgentFile("---\nskills: [brand-voice, Campaign_Brief, Tone Guide]\n---\nBody", "c.md", skills);
    expect(file.skillIds).toEqual(["s1", "s2"]);
    expect(file.missingSkills).toEqual(["Tone Guide"]);
  });

  it("takes skills as a - list too, and skips ones not in the library", () => {
    const text = "---\nskills:\n  - Brand voice\n  - Tone guide\n  - brand voice\n---\nBody";
    const file = readAgentFile(text, "c.md", skills);
    expect(file.skillIds).toEqual(["s1"]);
    expect(file.missingSkills).toEqual(["Tone guide"]);
  });

  it("falls back to the default model, the heading and the file name", () => {
    expect(readAgentFile("# Summary editor\nSummarise.", "x.md", skills)).toMatchObject({
      name: "summary-editor",
      model: DEFAULT_AGENT_MODEL,
      unknownModel: undefined,
      instructions: "# Summary editor\nSummarise.",
    });
    expect(readAgentFile("Body only", "social-planner.md", skills).name).toBe("social-planner");
  });

  it("keeps an unknown model only as a note", () => {
    const file = readAgentFile("---\nmodel: gemini-9\n---\nBody", "x.md", skills);
    expect(file.model).toBe(DEFAULT_AGENT_MODEL);
    expect(file.unknownModel).toBe("gemini-9");
  });

  it("reads the example file without notes", () => {
    const file = readAgentFile(EXAMPLE_AGENT_FILE, "agent-example.md", skills);
    expect(file.name).toBe("copywriter");
    expect(file.skillIds).toEqual(["s1"]);
    expect(agentFileNotes(file)).toEqual([]);
    expect(file.instructions).toMatch(/^You are a senior copywriter/);
  });
});

describe("what the form shows", () => {
  it("words the notes", () => {
    expect(agentFileNotes({ unknownModel: "gemini-9", missingSkills: [] })).toEqual([
      "Model gemini-9 isn't available, so Gemini 3.5 Flash Lite is used.",
    ]);
    expect(agentFileNotes({ missingSkills: ["Tone guide"] })).toEqual(["Tone guide isn't in your skills, so it's skipped."]);
    expect(agentFileNotes({ missingSkills: ["A", "B", "C"] })).toEqual(["A, B and C aren't in your skills, so they're skipped."]);
  });

  it("summarises model and skills, and lists names", () => {
    expect(agentSummary("gemini-3.8-flash", 2)).toBe("Gemini 3.8 Flash · 2 skills");
    expect(agentSummary("gemini-3.5-flash-lite", 0)).toBe("Gemini 3.5 Flash Lite · no skills");
    expect(listNames(["A", "B"])).toBe("A and B");
  });

  it("shows the skills that still exist, in the agent's order", () => {
    expect(agentSkills(agent, skills).map((s) => s.name)).toEqual(["campaign-brief", "brand-voice"]);
  });
});

describe("agents storage", () => {
  it("loads names saved before #237 as handles (#237)", () => {
    const storage = memoryStorage();
    expect(saveAgents([{ ...agent, name: "Copy Writer" }, { ...agent, id: "agent-2", name: "copy-writer" }], storage)).toBe(true);
    expect(loadAgents(storage).map((a) => a.name)).toEqual(["copy-writer", "copy-writer-2"]);
  });

  it("round-trips under its own key, with the file", () => {
    const storage = memoryStorage();
    expect(saveAgents([agent], storage)).toBe(true);
    expect(JSON.parse(storage.data.get(AGENTS_STORAGE_KEY)!)).toMatchObject({ version: 1, agents: [{ id: "agent-1" }] });
    expect(loadAgents(storage)).toEqual([agent]);
  });

  it("reports a refused write once, without throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(saveAgents([agent], memoryStorage(true))).toBe(false);
    expect(saveAgents([agent], memoryStorage(true))).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/^\[agents\]/);
  });

  it("starts empty on unreadable data and skips bad entries", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = memoryStorage();
    storage.setItem(AGENTS_STORAGE_KEY, "{oops");
    expect(loadAgents(storage)).toEqual([]);
    const { content: _content, ...noFile } = agent;
    storage.setItem(AGENTS_STORAGE_KEY, JSON.stringify({ version: 1, agents: [agent, noFile] }));
    expect(loadAgents(storage)).toEqual([agent]);
    expect(warn.mock.calls.every(([m]) => String(m).startsWith("[agents]"))).toBe(true);
  });
});

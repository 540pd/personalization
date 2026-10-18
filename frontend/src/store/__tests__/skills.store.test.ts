import { afterEach, describe, expect, it, vi } from "vitest";
import { SKILLS_STORAGE_KEY, loadSkills, saveSkills } from "../skills.store";
import type { Skill } from "@/app/canvas/skills/skillFile";

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

const skill: Skill = {
  id: "skill-1", name: "Brand voice", description: "Warm copy", tags: ["brand"],
  fileName: "brand-voice.md", size: 12, content: "# Brand voice", createdAt: 1,
};

afterEach(() => vi.restoreAllMocks());

describe("skills storage", () => {
  it("round-trips the skills under their own key", () => {
    const storage = memoryStorage();
    expect(saveSkills([skill], storage)).toBe(true);
    expect(JSON.parse(storage.data.get(SKILLS_STORAGE_KEY)!).version).toBe(1);
    expect(loadSkills(storage)).toEqual([skill]);
  });

  it("reports a refused write without throwing", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(saveSkills([skill], memoryStorage(true))).toBe(false);
  });

  it("starts empty, with a [skills] warning, on unreadable data", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = memoryStorage();
    expect(loadSkills(storage)).toEqual([]);
    storage.setItem(SKILLS_STORAGE_KEY, "{oops");
    expect(loadSkills(storage)).toEqual([]);
    storage.setItem(SKILLS_STORAGE_KEY, JSON.stringify({ version: 2, skills: [] }));
    expect(loadSkills(storage)).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0][0])).toMatch(/^\[skills\]/);
  });

  it("skips single entries it cannot read and keeps the rest", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = memoryStorage();
    storage.setItem(SKILLS_STORAGE_KEY, JSON.stringify({ version: 1, skills: [skill, { id: 3 }] }));
    expect(loadSkills(storage)).toEqual([skill]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("never throws when storage itself is unavailable", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken = { getItem: () => { throw new Error("denied"); } } as unknown as Storage;
    expect(loadSkills(broken)).toEqual([]);
  });
});

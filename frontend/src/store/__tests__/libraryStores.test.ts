// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSkills } from "../skills.store";
import { usersSentence } from "@/app/canvas/components/Library/useRemoval";
import type { Skill } from "@/app/canvas/skills/skillFile";

const skill = (id: string): Skill => ({
  id, name: id.toUpperCase(), description: "", tags: [], fileName: `${id}.md`, size: 1, content: "x", createdAt: 1,
});

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    removeItem: (k) => { data.delete(k); },
    setItem: (k, v) => { data.set(k, v); },
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  useSkills.setState({ skills: [skill("a"), skill("b"), skill("c")] });
});
afterEach(() => vi.unstubAllGlobals());

describe("remove and restore (#211)", () => {
  it("removes, and Undo puts the item back in its place", () => {
    const { remove, restore } = useSkills.getState();
    const b = useSkills.getState().skills[1];
    expect(remove("b")).toBe(true);
    expect(useSkills.getState().skills.map((s) => s.id)).toEqual(["a", "c"]);
    expect(restore(b, 1)).toBe(true);
    expect(useSkills.getState().skills).toEqual([skill("a"), skill("b"), skill("c")]);
  });

  it("never duplicates on a second restore, and clamps the place", () => {
    const { restore } = useSkills.getState();
    restore(skill("b"), 99);
    expect(useSkills.getState().skills.map((s) => s.id)).toEqual(["a", "c", "b"]);
  });

  it("changes nothing when storage refuses", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("localStorage", { setItem: () => { throw new Error("full"); } });
    expect(useSkills.getState().remove("a")).toBe(false);
    expect(useSkills.getState().skills).toHaveLength(3);
  });
});

describe("usersSentence", () => {
  it("names one, two, or two and a count", () => {
    expect(usersSentence(["Copywriter"])).toBe("Copywriter uses it. It'll stop using it.");
    expect(usersSentence(["A", "B"])).toBe("A and B use it. They'll stop using it.");
    expect(usersSentence(["A", "B", "C", "D"])).toBe("A, B and 2 more use it. They'll stop using it.");
    expect(usersSentence([])).toBe("");
  });
});

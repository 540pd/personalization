import { describe, expect, it } from "vitest";
import {
  allTags,
  copyName,
  descriptionError,
  filterItems,
  findByName,
  nameError,
  newId,
  normalizeTag,
  sameList,
  sortByName,
  toHandle,
  uniqueName,
  withHandles,
  type Listed,
} from "../fields";

const item = (over: Partial<Listed>): Listed => ({ id: "x", name: "Item", description: "", tags: [], ...over });

describe("normalizeTag", () => {
  it("lower-cases, joins words with - and caps the length", () => {
    expect(normalizeTag("  Spring 26 ")).toBe("spring-26");
    expect(normalizeTag("a,b")).toBe("ab");
    expect(normalizeTag("x".repeat(30))).toHaveLength(24);
    expect(normalizeTag("   ")).toBe("");
  });
});

describe("toHandle (#237)", () => {
  it("lower-cases, joins words with one hyphen and drops anything else", () => {
    expect(toHandle("Brand Voice!")).toBe("brand-voice");
    expect(toHandle("  brand__voice -- guide ")).toBe("brand-voice-guide");
    expect(toHandle("Tone v2")).toBe("tone-v2");
    expect(toHandle("a ! b")).toBe("a-b");
    expect(toHandle("-x-")).toBe("x");
  });

  it("folds accents and drops other scripts", () => {
    expect(toHandle("Café Crème")).toBe("cafe-creme");
    expect(toHandle("日本")).toBe("");
  });

  it("keeps one hyphen at the end while typing", () => {
    expect(toHandle("Brand ", true)).toBe("brand-");
    expect(toHandle("Brand  -", true)).toBe("brand-");
    expect(toHandle(" brand", true)).toBe("brand");
  });
});

describe("field errors", () => {
  it("require a name and a description, trimmed", () => {
    expect(nameError("  ")).toBe("Enter a name");
    expect(nameError("!?")).toBe("Enter a name");
    expect(nameError(" Brand ")).toBeNull();
    expect(nameError("n".repeat(61))).toMatch(/60/);
    expect(descriptionError("")).toBe("Enter a description");
    expect(descriptionError("d".repeat(201))).toMatch(/200/);
  });
});

describe("names", () => {
  const items = [item({ id: "1", name: "brand-voice" }), item({ id: "2", name: "brand-voice-2" })];

  it("finds a name compared as handles", () => {
    expect(findByName(items, "  Brand VOICE ")?.id).toBe("1");
    expect(findByName(items, "brand voice")?.id).toBe("1");
    expect(findByName(items, "brand")).toBeUndefined();
  });

  it("numbers a kept duplicate past any number already taken", () => {
    expect(uniqueName(items, "brand-voice")).toBe("brand-voice-3");
    expect(uniqueName(items, "other")).toBe("other-2");
  });

  it("numbers within the name limit", () => {
    const long = "n".repeat(60);
    expect(uniqueName([item({ name: long })], long)).toBe("n".repeat(58) + "-2");
  });

  it("makes ids with the kind's prefix, distinct", () => {
    expect(newId("agent")).toMatch(/^agent-/);
    expect(newId("skill")).not.toBe(newId("skill"));
  });
});

describe("table helpers", () => {
  const items = [
    item({ id: "a", name: "product photography", description: "Studio light", tags: ["image", "studio"] }),
    item({ id: "b", name: "Brand voice", description: "Warm copy", tags: ["copy", "brand"] }),
    item({ id: "c", name: "Campaign brief", description: "Key messages", tags: ["brand"] }),
  ];

  it("sorts by name ignoring case", () => {
    expect(sortByName(items).map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("lists every tag once, alphabetically", () => {
    expect(allTags(items)).toEqual(["brand", "copy", "image", "studio"]);
  });

  it("searches name and description, and filters by one tag", () => {
    expect(filterItems(items, "STUDIO", null).map((s) => s.id)).toEqual(["a"]);
    expect(filterItems(items, "brief", null).map((s) => s.id)).toEqual(["c"]);
    expect(filterItems(items, "", "brand").map((s) => s.id)).toEqual(["b", "c"]);
    expect(filterItems(items, "warm", "image")).toEqual([]);
  });
});

describe("sameList", () => {
  it("compares strings in order", () => {
    expect(sameList(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameList(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameList(["a"], ["a", "b"])).toBe(false);
    expect(sameList([], [])).toBe(true);
  });
});

describe("copyName", () => {
  it("adds -copy, then numbers further copies", () => {
    const items = [item({ name: "copywriter" })];
    expect(copyName(items, "copywriter")).toBe("copywriter-copy");
    const more = [...items, item({ name: "copywriter-copy" }), item({ name: "copywriter-copy-2" })];
    expect(copyName(more, "copywriter")).toBe("copywriter-copy-3");
  });

  it("stays within the name limit, with no hyphen left before the suffix", () => {
    const long = "n".repeat(60);
    expect(copyName([item({ name: long })], long)).toBe("n".repeat(55) + "-copy");
    const cut = "n".repeat(54) + "-abc";
    expect(copyName([item({ name: cut })], cut)).toBe("n".repeat(54) + "-copy");
  });
});

describe("withHandles (#237)", () => {
  const fallback = () => "skill";

  it("turns names saved before #237 into handles, in list order", () => {
    const out = withHandles(
      [item({ id: "a", name: "Brand voice" }), item({ id: "b", name: "brand-voice" }), item({ id: "c", name: "Tone" })],
      fallback,
    );
    expect(out.map((x) => [x.id, x.name])).toEqual([
      ["a", "brand-voice"],
      ["b", "brand-voice-2"],
      ["c", "tone"],
    ]);
  });

  it("falls back when nothing is left, and keeps items already right", () => {
    const right = item({ id: "r", name: "copywriter" });
    const out = withHandles([right, item({ id: "j", name: "日本" })], fallback);
    expect(out[0]).toBe(right);
    expect(out[1].name).toBe("skill");
  });
});

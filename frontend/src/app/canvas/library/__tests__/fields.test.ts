import { describe, expect, it } from "vitest";
import {
  allTags,
  descriptionError,
  filterItems,
  findByName,
  nameError,
  newId,
  normalizeTag,
  sameList,
  sortByName,
  uniqueName,
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

describe("field errors", () => {
  it("require a name and a description, trimmed", () => {
    expect(nameError("  ")).toBe("Enter a name");
    expect(nameError(" Brand ")).toBeNull();
    expect(nameError("n".repeat(61))).toMatch(/60/);
    expect(descriptionError("")).toBe("Enter a description");
    expect(descriptionError("d".repeat(201))).toMatch(/200/);
  });
});

describe("names", () => {
  const items = [item({ id: "1", name: "Brand voice" }), item({ id: "2", name: "Brand voice (2)" })];

  it("finds a name ignoring case and spaces at the ends", () => {
    expect(findByName(items, "  brand VOICE ")?.id).toBe("1");
    expect(findByName(items, "Brand")).toBeUndefined();
  });

  it("numbers a kept duplicate past any number already taken", () => {
    expect(uniqueName(items, "Brand voice")).toBe("Brand voice (3)");
    expect(uniqueName(items, "Other")).toBe("Other (2)");
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

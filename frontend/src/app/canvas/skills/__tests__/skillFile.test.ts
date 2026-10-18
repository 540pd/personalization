import { describe, expect, it } from "vitest";
import {
  allTags,
  descriptionError,
  fileProblem,
  filterSkills,
  findByName,
  formatSize,
  metaFromFile,
  nameError,
  nameFromFileName,
  normalizeTag,
  sortByName,
  uniqueName,
  type Skill,
} from "../skillFile";

const skill = (over: Partial<Skill>): Skill => ({
  id: "s", name: "Skill", description: "", tags: [], fileName: "s.md", size: 1, content: "x", createdAt: 0, ...over,
});

describe("fileProblem", () => {
  it("accepts .md and .markdown, any case, up to 100 KB", () => {
    expect(fileProblem({ name: "a.md", size: 10 })).toBeNull();
    expect(fileProblem({ name: "A.MARKDOWN", size: 100 * 1024 })).toBeNull();
  });

  it("names the file and the problem", () => {
    expect(fileProblem({ name: "notes.pdf", size: 10 })).toBe("notes.pdf isn't a markdown file");
    expect(fileProblem({ name: "guide.md", size: 100 * 1024 + 1 })).toBe("guide.md is over 100 KB");
    expect(fileProblem({ name: "guide.md", size: 0 })).toBe("guide.md is empty");
  });
});

describe("metaFromFile", () => {
  it("reads name and description from front matter, quoted or not", () => {
    const text = '---\nname: "Brand voice"\ndescription: Warm, direct copy\nlicense: x\n---\n# Ignored\n';
    expect(metaFromFile(text, "x.md")).toEqual({ name: "Brand voice", description: "Warm, direct copy" });
  });

  it("falls back to the first heading, then the file name", () => {
    expect(metaFromFile("Intro\n\n# Product photography ##\nmore", "p.md").name).toBe("Product photography");
    expect(metaFromFile("no heading here", "brand_voice-guide.md")).toEqual({ name: "Brand voice guide", description: "" });
  });

  it("uses the heading when front matter has no name", () => {
    expect(metaFromFile("---\ndescription: d\n---\n# Title\n", "x.md")).toEqual({ name: "Title", description: "d" });
  });

  it("ignores a --- that does not open the file", () => {
    expect(metaFromFile("# Top\n---\nname: Nope\n---\n", "x.md").name).toBe("Top");
  });

  it("caps what it fills at the field limits", () => {
    const meta = metaFromFile(`---\nname: ${"n".repeat(80)}\ndescription: ${"d".repeat(250)}\n---\n`, "x.md");
    expect(meta.name).toHaveLength(60);
    expect(meta.description).toHaveLength(200);
  });
});

describe("nameFromFileName", () => {
  it("drops the extension and separators and capitalises", () => {
    expect(nameFromFileName("brand-voice.md")).toBe("Brand voice");
    expect(nameFromFileName(".md")).toBe("");
  });
});

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
  const skills = [skill({ id: "1", name: "Brand voice" }), skill({ id: "2", name: "Brand voice (2)" })];

  it("finds a name ignoring case and spaces at the ends", () => {
    expect(findByName(skills, "  brand VOICE ")?.id).toBe("1");
    expect(findByName(skills, "Brand")).toBeUndefined();
  });

  it("numbers a kept duplicate past any number already taken", () => {
    expect(uniqueName(skills, "Brand voice")).toBe("Brand voice (3)");
    expect(uniqueName(skills, "Other")).toBe("Other (2)");
  });
});

describe("table helpers", () => {
  const skills = [
    skill({ id: "a", name: "product photography", description: "Studio light", tags: ["image", "studio"] }),
    skill({ id: "b", name: "Brand voice", description: "Warm copy", tags: ["copy", "brand"] }),
    skill({ id: "c", name: "Campaign brief", description: "Key messages", tags: ["brand"] }),
  ];

  it("sorts by name ignoring case", () => {
    expect(sortByName(skills).map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("lists every tag once, alphabetically", () => {
    expect(allTags(skills)).toEqual(["brand", "copy", "image", "studio"]);
  });

  it("searches name and description, and filters by one tag", () => {
    expect(filterSkills(skills, "STUDIO", null).map((s) => s.id)).toEqual(["a"]);
    expect(filterSkills(skills, "brief", null).map((s) => s.id)).toEqual(["c"]);
    expect(filterSkills(skills, "", "brand").map((s) => s.id)).toEqual(["b", "c"]);
    expect(filterSkills(skills, "warm", "image")).toEqual([]);
  });

  it("formats sizes", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(2150)).toBe("2.1 KB");
  });
});

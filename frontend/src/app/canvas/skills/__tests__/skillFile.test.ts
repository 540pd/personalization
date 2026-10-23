import { describe, expect, it } from "vitest";
import { fileProblem, formatSize, metaFromFile, nameFromFileName, readFrontMatter, stripFrontMatter } from "../skillFile";

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
    const text = '---\nname: "Brand Voice"\ndescription: Warm, direct copy\nlicense: x\n---\n# Ignored\n';
    expect(metaFromFile(text, "x.md")).toEqual({ name: "brand-voice", description: "Warm, direct copy", tags: [] });
  });

  it("falls back to the first heading, then the file name", () => {
    expect(metaFromFile("Intro\n\n# Product photography ##\nmore", "p.md").name).toBe("product-photography");
    expect(metaFromFile("no heading here", "brand_voice-guide.md")).toEqual({ name: "brand-voice-guide", description: "", tags: [] });
  });

  it("skips a name or heading that leaves no handle (#237)", () => {
    expect(metaFromFile("---\nname: 日本\n---\n# Tone\n", "x.md").name).toBe("tone");
    expect(metaFromFile("# !!!\n", "brand voice.md").name).toBe("brand-voice");
  });

  it("uses the heading when front matter has no name", () => {
    expect(metaFromFile("---\ndescription: d\n---\n# Title\n", "x.md")).toEqual({ name: "title", description: "d", tags: [] });
  });

  it("ignores a --- that does not open the file", () => {
    expect(metaFromFile("# Top\n---\nname: Nope\n---\n", "x.md").name).toBe("top");
  });

  it("caps what it fills at the field limits", () => {
    const meta = metaFromFile(`---\nname: ${"n".repeat(80)}\ndescription: ${"d".repeat(250)}\n---\n`, "x.md");
    expect(meta.name).toHaveLength(60);
    expect(meta.description).toHaveLength(200);
  });
});

describe("tags from front matter", () => {
  it("normalises them, drops duplicates and keeps five", () => {
    const text = "---\ntags: [Brand, brand, Spring 26, a, b, c, d]\n---\nBody";
    expect(metaFromFile(text, "x.md").tags).toEqual(["brand", "spring-26", "a", "b", "c"]);
  });
});

describe("readFrontMatter", () => {
  it("reads strings, [a, b] lists and - lists, first key wins", () => {
    const text = "---\nName: A\nname: B\nskills: ['x', \"y\"]\ntags:\n  - one\n  - two\nmodel: m\nnot a line\n---\nBody";
    expect(readFrontMatter(text)).toEqual({ name: "A", skills: ["x", "y"], tags: ["one", "two"], model: "m" });
  });

  it("is empty without front matter", () => {
    expect(readFrontMatter("# Title")).toEqual({});
  });
});

describe("stripFrontMatter", () => {
  it("drops a front matter block at the top only", () => {
    expect(stripFrontMatter("---\nname: A\n---\nBody")).toBe("Body");
    expect(stripFrontMatter("Body\n---\nx\n---\n")).toBe("Body\n---\nx\n---\n");
  });
});

describe("nameFromFileName", () => {
  it("makes a handle of the file name without its extension", () => {
    expect(nameFromFileName("Brand_Voice.md")).toBe("brand-voice");
    expect(nameFromFileName("brand-voice.markdown")).toBe("brand-voice");
    expect(nameFromFileName(".md")).toBe("");
  });
});

describe("formatSize", () => {
  it("formats bytes and kilobytes", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(2150)).toBe("2.1 KB");
  });
});

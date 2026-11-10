import { describe, expect, it } from "vitest";
import { checkFile, contentHash, duplicateMessage, isUtf8, wrongType } from "../fileChecks";

// The Assets page's file checks (#462).

const file = (name: string, type: string, bytes: BlobPart = "x") => new File([bytes], name, { type });

describe("file checks (#462)", () => {
  it("takes PNG or JPG for images, and names the group when it refuses", () => {
    expect(wrongType(file("a.png", "image/png"), "productImage")).toBeNull();
    expect(wrongType(file("a.jpg", "image/jpeg"), "reference")).toBeNull();
    expect(wrongType(file("a.gif", "image/gif"), "styleExample")).toBe("a.gif: style examples must be PNG or JPG.");
    expect(wrongType(file("a.webp", "image/webp"), "adaptFrom")).toBe("a.webp: creatives to adapt from must be PNG or JPG.");
  });

  it("takes only a PNG for a logo", () => {
    expect(wrongType(file("l.png", "image/png"), "logo")).toBeNull();
    expect(wrongType(file("l.jpg", "image/jpeg"), "logo")).toMatch(/^The logo must be a PNG/);
  });

  it("takes only Markdown for guidelines", () => {
    expect(wrongType(file("g.md", "text/markdown"), "guidelines")).toBeNull();
    expect(wrongType(file("g.txt", "text/plain"), "guidelines")).toBe("g.txt: only Markdown (.md) files.");
  });

  it("tells UTF-8 text from other bytes", async () => {
    expect(await isUtf8(file("g.md", "text/markdown", "# Brand ✓"))).toBe(true);
    expect(await isUtf8(file("g.md", "text/markdown", new Uint8Array([0xff, 0xfe, 0x00])))).toBe(false);
  });

  it("checks guidelines are text, and only once the rest is right", async () => {
    expect(await checkFile(file("g.md", "text/markdown", "# Brand"), "guidelines")).toBeNull();
    expect(await checkFile(file("g.md", "text/markdown", new Uint8Array([0xff])), "guidelines")).toBe("g.md: this file isn't plain text.");
    expect(await checkFile(file("g.txt", "text/plain", new Uint8Array([0xff])), "guidelines")).toBe("g.txt: only Markdown (.md) files.");
    // Images are never read as text.
    expect(await checkFile(file("a.png", "image/png", new Uint8Array([0xff])), "productImage")).toBeNull();
  });

  it("hashes the bytes, not the name", async () => {
    const a = await contentHash(file("a.png", "image/png", "same"));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await contentHash(file("b.png", "image/png", "same"))).toBe(a);
    expect(await contentHash(file("a.png", "image/png", "other"))).not.toBe(a);
  });

  it("calls guidelines a file and the rest an image when refusing a duplicate", () => {
    expect(duplicateMessage(file("g.md", "text/markdown"), "guidelines")).toBe("g.md: this file is already here.");
    expect(duplicateMessage(file("a.png", "image/png"), "logo")).toBe("a.png: this image is already here.");
  });
});

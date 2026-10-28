import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { inflateSync } from "node:zlib";
import request from "supertest";
import { placeholderImageUrl, placeholderPng, placeholderSize } from "../placeholderImage.js";
import type { AspectRatioV2 } from "../types.js";

// The placeholder for Vertex AI images (#335): drawn here, at the shape asked.

/** Width and height from a PNG's IHDR, and its first pixel. */
function readPng(png: Buffer) {
  expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const idatLen = png.readUInt32BE(33);
  const raw = inflateSync(png.subarray(41, 41 + idatLen));
  expect(raw.length).toBe((width * 3 + 1) * height);
  return { width, height, first: [...raw.subarray(1, 4)] };
}

afterEach(() => vi.unstubAllEnvs());

describe("placeholderPng", () => {
  const shapes: Array<[AspectRatioV2, number, number]> = [
    ["1:1", 1024, 1024], ["16:9", 1024, 576], ["9:16", 576, 1024], ["4:3", 1024, 768], ["3:4", 768, 1024],
  ];

  it.each(shapes)("is a valid PNG at %s: %ix%i", (ratio, width, height) => {
    expect(placeholderSize(ratio)).toEqual({ width, height });
    expect(readPng(placeholderPng(ratio, 200))).toMatchObject({ width, height });
  });

  it("differs by hue, so variants can be told apart", () => {
    expect(readPng(placeholderPng("1:1", 0)).first).not.toEqual(readPng(placeholderPng("1:1", 180)).first);
    expect(placeholderImageUrl("1:1")).not.toBe(placeholderImageUrl("1:1"));
  });

  it("is answered as a data: URL, like the real capability", () => {
    const url = placeholderImageUrl("16:9");
    expect(url).toMatch(/^data:image\/png;base64,/);
    expect(readPng(Buffer.from(url.split(",")[1], "base64"))).toMatchObject({ width: 1024, height: 576 });
  });
});

describe("the image mock with local disk storage", () => {
  it("is stored as an asset, served at its shape", async () => {
    vi.resetModules();
    vi.stubEnv("VERTEX_PROJECT_ID", "");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "");
    vi.stubEnv("LOCAL_DATA_DIR", mkdtempSync(path.join(tmpdir(), "gcos-placeholder-")));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { createApp } = await import("../../server.js");
    const a = createApp();

    const res = await request(a).post("/api/generate/image")
      .send({ modelId: "gemini-3.1-flash-image", instruction: "a cat", aspectRatio: "9:16" });
    expect(res.body.imageUrl).toMatch(/^\/api\/proxy\/assets\/[0-9a-f-]{36}\/content$/);

    const served = await request(a).get(res.body.imageUrl.replace("/api/proxy", "/api")).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(served.headers["content-type"]).toBe("image/png");
    expect(readPng(served.body as Buffer)).toMatchObject({ width: 576, height: 1024 });
    vi.restoreAllMocks();
  });
});

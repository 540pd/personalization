import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import type { Express } from "express";
import { readBrandRequest, withBrand } from "../../services/brandContext.js";
import { buildSystemInstruction } from "../../capabilities/prompt.js";

// Generation uses the brand (#452): the brief from the request, the rest from
// the saved Assets page, on the memory store and the mock text model.

const SECRET = "test-secret";
const EMAIL = "ana@accenture.com";
const ANA = `gcos_session=${jwt.sign({ email: EMAIL }, SECRET, { expiresIn: 3600 })}`;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]);

async function app(): Promise<Express> {
  vi.resetModules();
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-id");
  vi.stubEnv("SESSION_SECRET", SECRET);
  vi.stubEnv("VERTEX_PROJECT_ID", "");
  for (const k of ["FIRESTORE_PROJECT_ID", "GCS_BUCKET_NAME"]) vi.stubEnv(k, "");
  const { createApp } = await import("../../server.js");
  return createApp();
}

async function upload(a: Express, kind: string, name: string, body: Buffer = PNG, type = "image/png", details?: Record<string, string>, description?: string) {
  const res = await request(a).post(`/api/assets?kind=${kind}&name=${name}`).set("Cookie", ANA).set("Content-Type", type).send(body);
  expect(res.status).toBe(201);
  if (details || description) {
    await request(a).patch(`/api/assets/${res.body.id}`).set("Cookie", ANA).send({ ...(details ? { details } : {}), ...(description ? { description } : {}) });
  }
  return res.body.id as string;
}

async function savePage(a: Express, record: Record<string, unknown>) {
  const current = await request(a).get("/api/brand-assets").set("Cookie", ANA);
  const res = await request(a).put("/api/brand-assets").set("Cookie", ANA).send({
    revision: current.body.revision, productName: "", sku: "", masterId: "",
    colours: { primary: "", secondary: "", accent: "" }, assetIds: [], ...record,
  });
  expect(res.status).toBe(200);
}

const BRIEF = {
  name: "Urban Running 2026", objective: "Awareness", audience: "City runners", message: "Run the city",
  tones: ["Bold", "Warm"], mandatory: { product: true, logo: true, cta: true, legal: false },
  ctaText: "Shop now", legalText: "T&Cs apply", dos: "Show motion\n- Daylight", donts: "Competitors", referenceIds: [] as string[],
};

/** A page with a master, a logo, two references (one Always, one picked) and guidelines. */
async function setUpBrand(a: Express, guidelines = "# Rules\n\nLogo on light backgrounds only.") {
  const master = await upload(a, "productImage", "front.png");
  const logo = await upload(a, "logo", "logo.png", PNG, "image/png", { logoType: "Primary logo" });
  const street = await upload(a, "reference", "street.png", PNG, "image/png", { use: "inspiration", scope: "picked" }, "Wet street at dusk");
  const sand = await upload(a, "reference", "sand.png", PNG, "image/png", { use: "asIs", scope: "always" }, "Warm sand");
  const rules = await upload(a, "guidelines", "rules.md", Buffer.from(guidelines), "text/markdown", { title: "Brand book", docType: "Brand Guidelines" });
  await savePage(a, { productName: "Trail shoe", sku: "TRS-1", masterId: master, colours: { primary: "#1A2B3C", secondary: "", accent: "" }, assetIds: [master, logo, street, sand, rules] });
  return { master, logo, street, sand, rules };
}

/** Saves the Brand page with `brief` as its campaign (#454): generation reads the saved one. */
async function saveBrief(a: Express, brief: Record<string, unknown>) {
  const current = await request(a).get("/api/brand").set("Cookie", ANA);
  const res = await request(a).put("/api/brand").set("Cookie", ANA).send({ revision: current.body.revision, brand: { industry: "", homepageUrl: "", campaign: brief } });
  expect(res.status).toBe(200);
}

const text = (a: Express, body: Record<string, unknown>) =>
  request(a).post("/api/generate/text").set("Cookie", ANA).send({ modelId: "gemini-3.5-flash-lite", instruction: "Three taglines", ...body });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.doUnmock("../../services/brandAssetsService.js");
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("readBrandRequest", () => {
  it("is on for true, off for false or nothing; a brief from an older client reads as on", () => {
    expect(readBrandRequest(undefined)).toEqual({ ok: true, on: false });
    expect(readBrandRequest(false)).toEqual({ ok: true, on: false });
    expect(readBrandRequest(true)).toEqual({ ok: true, on: true });
    expect(readBrandRequest({ brief: { name: "X" } })).toEqual({ ok: true, on: true });
    expect(readBrandRequest("yes").ok).toBe(false);
  });
});

describe("the brand block in prompts", () => {
  it("goes ahead of an image prompt, under its own heading", () => {
    expect(withBrand("A shoe", "## Brand\n\nX")).toBe("## Brand\n\nX\n\n## Prompt\n\nA shoe");
    expect(withBrand("## Skill: a\n\nb\n\n## Prompt\n\nA shoe", "## Brand\n\nX")).toBe("## Brand\n\nX\n\n## Skill: a\n\nb\n\n## Prompt\n\nA shoe");
    expect(withBrand("A shoe", undefined)).toBe("A shoe");
  });

  it("comes first in a text model's system instruction", () => {
    expect(buildSystemInstruction({ name: "copy", instructions: "Write copy." }, [], "## Brand\n\nX")).toBe("## Brand\n\nX\n\nWrite copy.");
  });
});

describe("buildBrandContext", () => {
  it("builds the text and the named images, Always references first, within the limits", async () => {
    const a = await app();
    const ids = await setUpBrand(a);
    const { buildBrandContext } = await import("../../services/brandContext.js");
    const ctx = await buildBrandContext(EMAIL, { ...BRIEF, referenceIds: [ids.street] });
    if (ctx.failed) throw new Error("failed");

    expect(ctx.references.map((r) => r.name)).toEqual(["Product: Trail shoe", "Brand logo", "Reference: Warm sand", "Reference: Wet street at dusk"]);
    expect(ctx.references[0]).toMatchObject({ kind: "image", url: `/api/proxy/assets/${ids.master}/content` });
    expect(ctx.used).toEqual(["brief", "Trail shoe", "logo", "2 references", "1 guidelines file"]);
    const block = ctx.block!;
    for (const part of [
      "## Brand", "- Campaign: Urban Running 2026", "- Market and language: Europe, English", "- Tone: Bold, Warm",
      '- The product, exactly as in "Product: Trail shoe".', '- The call to action "Shop now".', "### Do\n- Show motion\n- Daylight",
      "- SKU: TRS-1", "- Primary: #1A2B3C", '- "Reference: Warm sand": use this image itself.',
      '- "Reference: Wet street at dusk": take its mood, light or setting only, never the image itself.',
      "### Guidelines: Brand book (Brand Guidelines)\n\n# Rules",
    ]) expect(block).toContain(part);
    expect(block).not.toContain("T&Cs apply");
  });

  it("leaves out what the brief does not ask for, and is empty with nothing set up", async () => {
    const a = await app();
    await setUpBrand(a);
    const { buildBrandContext } = await import("../../services/brandContext.js");
    const off = await buildBrandContext(EMAIL, { mandatory: { product: false, logo: false } });
    if (off.failed) throw new Error("failed");
    expect(off.references.map((r) => r.name)).toEqual(["Reference: Warm sand"]);
    expect(off.block).not.toContain("Must include");
    expect(off.block).not.toContain("Campaign brief");

    // Never saved: product and logo mandatory, as the page starts.
    const fresh = await buildBrandContext(EMAIL, {});
    if (fresh.failed) throw new Error("failed");
    expect(fresh.references.map((r) => r.name)).toEqual(["Product: Trail shoe", "Brand logo", "Reference: Warm sand"]);

    await savePage(a, { assetIds: [] });
    const none = await buildBrandContext(EMAIL, {});
    expect(none).toEqual({ failed: false, block: undefined, references: [], used: [] });
  });

  it("caps references at four and cuts long guidelines to fit", async () => {
    const a = await app();
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) ids.push(await upload(a, "reference", `r${i}.png`, Buffer.concat([PNG, Buffer.from([i])]), "image/png", { scope: "always" }, `Ref ${i}`));
    const long = await upload(a, "guidelines", "long.md", Buffer.from("x".repeat(90_000)), "text/markdown");
    await savePage(a, { assetIds: [...ids, long] });
    const { buildBrandContext, MAX_BRAND_TEXT } = await import("../../services/brandContext.js");
    const ctx = await buildBrandContext(EMAIL, {});
    if (ctx.failed) throw new Error("failed");
    expect(ctx.references.map((r) => r.name)).toEqual(["Reference: Ref 0", "Reference: Ref 1", "Reference: Ref 2", "Reference: Ref 3"]);
    expect(ctx.block!.length).toBeLessThanOrEqual(MAX_BRAND_TEXT + 100);
    expect(ctx.block).toContain("(The guidelines were cut to fit. Follow what is here.)");
  });
});

describe("POST /api/generate/text with the brand", () => {
  it("sends the brand: the mock names what it got, and the reply says what was used", async () => {
    const a = await app();
    await setUpBrand(a);
    await saveBrief(a, BRIEF);
    const res = await text(a, { brand: true });
    expect(res.status).toBe(200);
    expect(res.body.brand).toEqual({ used: ["brief", "Trail shoe", "logo", "1 reference", "1 guidelines file"] });
    expect(res.body.text).toContain("(with 3 references: Product: Trail shoe, Brand logo, Reference: Warm sand)");
    expect(res.body.text).toContain("(with brand: brief, Trail shoe, logo, 1 reference, 1 guidelines file)");
  });

  it("adds nothing with the brand off, or from a client that sends none", async () => {
    const a = await app();
    await setUpBrand(a);
    for (const body of [{ brand: false }, {}]) {
      const res = await text(a, body);
      expect(res.body.text).toBe("[mock] Three taglines");
      expect(res.body.brand).toBeUndefined();
    }
  });

  it("refuses a brand that is neither on nor off", async () => {
    const a = await app();
    expect((await text(a, { brand: "yes" })).status).toBe(400);
  });

  it("uses the saved brief, not one sent by an older client", async () => {
    const a = await app();
    await setUpBrand(a);
    await saveBrief(a, { mandatory: { product: false, logo: false } });
    const res = await text(a, { brand: { brief: BRIEF } });
    expect(res.body.brand).toEqual({ used: ["1 reference", "1 guidelines file"] });
  });

  it("generates without the brand when Assets cannot be read, and says so", async () => {
    vi.doMock("../../services/brandAssetsService.js", async (orig) => ({
      ...(await orig<object>()),
      getBrandAssets: async () => {
        throw new Error("store down");
      },
    }));
    const a = await app();
    const res = await text(a, { brand: true });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe("[mock] Three taglines");
    expect(res.body.brand).toEqual({ failed: true });
  });
});

describe("POST /api/generate/image with the brand", () => {
  it("says what it used", async () => {
    const a = await app();
    await setUpBrand(a);
    await saveBrief(a, BRIEF);
    const res = await request(a).post("/api/generate/image").set("Cookie", ANA)
      .send({ modelId: "gemini-3.1-flash-image", instruction: "A hero shot", aspectRatio: "1:1", brand: true });
    expect(res.status).toBe(200);
    expect(res.body.brand).toEqual({ used: ["brief", "Trail shoe", "logo", "1 reference", "1 guidelines file"] });
  });
});

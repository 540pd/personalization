// The brand, for generation (#452): the Campaign Brief from the request, and
// the product, logo, references and guidelines from the user's saved Assets
// page, as one text block and a few named image references.
//
// The brief lives in the browser for now (#409), so it comes with the
// request; everything else is read here, for the signed-in user only. Image
// references go by their stored URL and are read into bytes with the
// prompt's own (resolveAssetReferences), so they are loaded one way.

import type { Reference } from "../capabilities/types.js";
import { getBrandAssets } from "./brandAssetsService.js";
import { openAsset, type AssetView } from "./assetService.js";

/** Brand images per request: the master, the logo, then references. */
export const MAX_BRAND_REFERENCES = 4;
/** Brand text per request; guidelines are cut to fit. Image models do worse with very long prompts. */
export const MAX_BRAND_TEXT = 30_000;

const MAX_FIELD = 4000;
const MAX_TONES = 10;
const MAX_PICKED = 100;

/** The brief as the Brand page holds it (#409, #442): every field optional. */
export interface BriefInput {
  name?: string;
  objective?: string;
  audience?: string;
  insight?: string;
  message?: string;
  tones?: string[];
  offer?: string;
  mandatory?: { product?: boolean; logo?: boolean; cta?: boolean; legal?: boolean };
  ctaText?: string;
  legalText?: string;
  dos?: string;
  donts?: string;
  referenceIds?: string[];
}

const TEXT_FIELDS = ["name", "objective", "audience", "insight", "message", "offer", "ctaText", "legalText", "dos", "donts"] as const;

export type BrandRequest = { ok: true; brief: BriefInput | null } | { ok: false; message: string };

/**
 * `brand` from a generate request: false or absent is off (a client not yet
 * redeployed sends nothing, and gets what it got before); `{ brief }` is on.
 * Validated inline, no Zod (CLAUDE.md).
 */
export function readBrandRequest(raw: unknown): BrandRequest {
  if (raw === undefined || raw === null || raw === false) return { ok: true, brief: null };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, message: "brand must be { brief } or false." };
  const brief = (raw as { brief?: unknown }).brief ?? {};
  if (typeof brief !== "object" || brief === null || Array.isArray(brief)) return { ok: false, message: "brand.brief must be an object." };
  const b = brief as Record<string, unknown>;

  const out: BriefInput = {};
  for (const key of TEXT_FIELDS) {
    const value = b[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.length > MAX_FIELD) return { ok: false, message: `brand.brief.${key} must be text, up to ${MAX_FIELD} characters.` };
    out[key] = value;
  }
  if (b.tones !== undefined) {
    if (!Array.isArray(b.tones) || b.tones.length > MAX_TONES || !b.tones.every((t) => typeof t === "string" && t.length <= 40)) {
      return { ok: false, message: `brand.brief.tones must be up to ${MAX_TONES} short words.` };
    }
    out.tones = b.tones as string[];
  }
  if (b.mandatory !== undefined) {
    const m = b.mandatory as Record<string, unknown>;
    if (typeof m !== "object" || m === null || Array.isArray(m) || !Object.values(m).every((v) => typeof v === "boolean")) {
      return { ok: false, message: "brand.brief.mandatory must be on/off switches." };
    }
    out.mandatory = { product: m.product === true, logo: m.logo === true, cta: m.cta === true, legal: m.legal === true };
  }
  if (b.referenceIds !== undefined) {
    if (!Array.isArray(b.referenceIds) || b.referenceIds.length > MAX_PICKED || !b.referenceIds.every((id) => typeof id === "string")) {
      return { ok: false, message: "brand.brief.referenceIds must be a list of asset ids." };
    }
    out.referenceIds = b.referenceIds as string[];
  }
  return { ok: true, brief: out };
}

export type BrandContext =
  | {
      failed: false;
      /** The "## Brand" text, or undefined when there is nothing to say. */
      block?: string;
      /** Named image references, by stored URL, ahead of the prompt's own. */
      references: Reference[];
      /** What was used, for the response and the mock: "brief", "logo", "2 references"… */
      used: string[];
    }
  | { failed: true };

const USE_NOTE: Record<string, string> = {
  asIs: "use this image itself",
  inspiration: "take its mood, light or setting only, never the image itself",
};

const line = (label: string, value?: string) => (value?.trim() ? `- ${label}: ${value.trim()}` : null);
const lines = (title: string, rows: (string | null)[]) => {
  const kept = rows.filter((r): r is string => !!r);
  return kept.length ? [`### ${title}`, ...kept].join("\n") : null;
};
/** Free multi-line text as a list: the brief's Do / Don't, one rule a line. */
const rules = (text?: string) => (text ?? "").split("\n").map((r) => r.trim()).filter(Boolean).map((r) => `- ${r.replace(/^[-*]\s*/, "")}`);

async function readText(id: string, userId: string): Promise<string> {
  const found = await openAsset(id, userId);
  if (!found) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of found.stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  return Buffer.concat(chunks).toString("utf-8").trim();
}

/**
 * The brand for one generation. Never throws: a brand that cannot be read is
 * `{ failed: true }`, and the route generates without it (#452 decision 3).
 */
export async function buildBrandContext(userId: string, brief: BriefInput): Promise<BrandContext> {
  try {
    const view = await getBrandAssets(userId);
    const of = (kind: string) => view.assets.filter((a) => a.kind === kind);
    const mandatory = brief.mandatory ?? {};
    const used: string[] = [];
    const references: Reference[] = [];

    // ── images ────────────────────────────────────────────────────────────
    const productName = view.record.productName.trim();
    const master = of("productImage").find((a) => a.id === view.record.masterId);
    const productRef = master && mandatory.product ? `Product: ${productName || master.name}` : null;
    if (master && productRef) references.push({ kind: "image", url: master.url, name: productRef });

    const logos = of("logo");
    const logo = logos.find((a) => a.details.logoType === "Primary logo") ?? logos[0];
    const logoRef = logo && mandatory.logo ? "Brand logo" : null;
    if (logo && logoRef) references.push({ kind: "image", url: logo.url, name: logoRef });

    // Always ones first, then the brief's picks, each in the page's order.
    const picked = new Set(brief.referenceIds ?? []);
    const refs = of("reference");
    const inUse = [...refs.filter((r) => r.details.scope === "always"), ...refs.filter((r) => r.details.scope !== "always" && picked.has(r.id))];
    const sent: { asset: AssetView; name: string }[] = inUse.slice(0, MAX_BRAND_REFERENCES).map((asset) => ({
      asset,
      name: `Reference: ${asset.description.trim() || asset.name}`,
    }));
    for (const r of sent) references.push({ kind: "image", url: r.asset.url, name: r.name });

    // ── text ──────────────────────────────────────────────────────────────
    const briefed = TEXT_FIELDS.some((k) => brief[k]?.trim()) || !!brief.tones?.length;
    const sections = [
      lines("Campaign brief", [
        line("Campaign", brief.name),
        line("Objective", brief.objective),
        // Fixed for this phase (#409); said only with a brief, so no brief is no block.
        line("Market and language", briefed ? "Europe, English" : undefined),
        line("Audience", brief.audience),
        line("Audience insight", brief.insight),
        line("Key message", brief.message),
        line("Tone", brief.tones?.join(", ")),
        line("Offer", brief.offer),
      ]),
      lines("Must include", [
        productRef ? `- The product, exactly as in "${productRef}".` : null,
        logoRef ? `- The brand logo, as in "${logoRef}", unaltered.` : null,
        mandatory.cta && brief.ctaText?.trim() ? `- The call to action "${brief.ctaText.trim()}".` : null,
        mandatory.legal && brief.legalText?.trim() ? `- This legal copy, word for word: "${brief.legalText.trim()}"` : null,
      ]),
      lines("Do", rules(brief.dos)),
      lines("Don't", rules(brief.donts)),
      lines("Product", [line("Name", productName), line("SKU", view.record.sku)]),
      lines("Brand colours", [line("Primary", view.record.colours.primary), line("Secondary", view.record.colours.secondary), line("Accent", view.record.colours.accent)]),
      lines("References", sent.map((r) => `- "${r.name}": ${USE_NOTE[r.asset.details.use] ?? USE_NOTE.inspiration}.`)),
    ].filter((s): s is string => !!s);

    // Guidelines last, and cut to what is left of the limit.
    const guidelines = of("guidelines");
    const head = ["## Brand", "Keep everything you make true to this brand.", ...sections].join("\n\n");
    let room = MAX_BRAND_TEXT - head.length;
    const docs: string[] = [];
    let cut = false;
    for (const g of guidelines) {
      const text = await readText(g.id, userId);
      if (!text) continue;
      const title = `### Guidelines: ${g.details.title || g.name.replace(/\.md$/i, "")} (${g.details.docType || "Brand Guidelines"})`;
      const whole = `${title}\n\n${text}`;
      if (whole.length + 2 <= room) {
        docs.push(whole);
        room -= whole.length + 2;
      } else {
        if (room > title.length + 200) docs.push(whole.slice(0, room - 2));
        cut = true;
        break;
      }
    }
    if (cut) docs.push("(The guidelines were cut to fit. Follow what is here.)");

    if (briefed) used.push("brief");
    if (productRef) used.push(productName || "product");
    if (logoRef) used.push("logo");
    if (sent.length) used.push(`${sent.length} reference${sent.length > 1 ? "s" : ""}`);
    const docCount = docs.filter((d) => d.startsWith("### Guidelines")).length;
    if (docCount) used.push(`${docCount} guidelines file${docCount > 1 ? "s" : ""}`);

    const hasText = sections.length > 0 || docs.length > 0;
    return { failed: false, block: hasText ? [head, ...docs].join("\n\n") : undefined, references, used };
  } catch (err) {
    console.error("[brandContext] could not read the brand:", err);
    return { failed: true };
  }
}

/** An image prompt with the brand ahead of it (#452): these models take no system instruction. */
export function withBrand(instruction: string, block?: string): string {
  if (!block) return instruction;
  // withSkills has already put its own "## Prompt" heading in when it added skills.
  const body = instruction.startsWith("## ") ? instruction : `## Prompt\n\n${instruction}`;
  return `${block}\n\n${body}`;
}

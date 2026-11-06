// What Use brand will send (#452), said in one line under the switch:
// "Brief · Trail running shoe · Logo · 2 references · 1 guidelines file". The
// same rules the backend applies (services/brandContext.ts), so the line
// matches what goes: the product and logo only when the brief makes them
// mandatory, at most four references, Always ones counted first.

import type { BrandAssetsView } from "@/api/brandAssets.api";
import type { CampaignBrief } from "@/store/brand.store";
import { briefLogo, briefProduct } from "./briefAssets";

/** As the backend: the master, the logo, then up to this many references. */
export const MAX_BRAND_REFERENCES = 4;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The parts that will be used, in order; empty when nothing is set up. */
export function brandSummary(view: BrandAssetsView, brief: CampaignBrief): string[] {
  const parts: string[] = [];
  const briefed =
    [brief.name, brief.objective, brief.audience, brief.insight, brief.message, brief.offer, brief.ctaText, brief.legalText, brief.dos, brief.donts].some(
      (v) => v.trim(),
    ) || brief.tones.length > 0;
  if (briefed) parts.push("Brief");

  const product = briefProduct(view);
  if (product && brief.mandatory.product) parts.push(product.name || "Product");
  if (briefLogo(view) && brief.mandatory.logo) parts.push("Logo");

  const saved = new Set(view.record.assetIds);
  const picked = new Set(brief.referenceIds);
  const refs = view.assets.filter((a) => a.kind === "reference" && saved.has(a.id));
  const inUse = refs.filter((r) => r.details.scope === "always" || picked.has(r.id)).length;
  if (inUse) parts.push(plural(Math.min(inUse, MAX_BRAND_REFERENCES), "reference"));

  const docs = view.assets.filter((a) => a.kind === "guidelines" && saved.has(a.id)).length;
  if (docs) parts.push(plural(docs, "guidelines file"));
  return parts;
}

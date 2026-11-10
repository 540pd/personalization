// "Describe it" on the Assets page (#448): one line about a stored image,
// written by the text model looking at it. Through the text capability, so
// mock mode (no VERTEX_PROJECT_ID) answers a placeholder rather than failing.

import { getTextCapability } from "../capabilities/index.js";
import { MAX_DESCRIPTION, type AssetKind } from "../lib/assets/index.js";
import { openAsset } from "./assetService.js";

/** The cheaper text model: a one-line description needs no more. */
export const DESCRIBE_MODEL = "gemini-3.5-flash-lite";

const RULES =
  "Answer with one line of at most 25 words, for a creative team. " +
  "Plain words, no quotes, no lead-in such as \"This image shows\".";

/**
 * What to say about each kind of image: what generation needs to know of it.
 * Brand guidelines (#450) are text and never get here.
 */
const PROMPTS: Partial<Record<AssetKind, string>> & { other: string } = {
  productImage: "Describe this product image: the product, its colour or material, the view, and the background.",
  adaptFrom: "Describe this campaign creative: its layout, its style, and what it shows.",
  styleExample: "Describe this example creative: its layout, its style, and what it shows.",
  logo: "Describe this logo: its mark, its wordmark if any, and its colours.",
  reference: "Describe this reference image: the scene, the light, and the mood.",
  other: "Describe this image: what it shows and its style.",
};

export type DescribeResult = { description: string } | { error: "not_found" } | { error: "not_an_image" };

/** The model's answer as a description: one line, unquoted, within the limit. */
export function cleanDescription(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“‘]+|["'”’]+$/g, "")
    .trim()
    .slice(0, MAX_DESCRIPTION);
}

async function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  return Buffer.concat(chunks);
}

/** Describes the user's own image `id`; another user's, or a missing one, is not found. */
export async function describeAsset(id: string, userId: string): Promise<DescribeResult> {
  const found = await openAsset(id, userId);
  if (!found) return { error: "not_found" };
  const { asset, stream } = found;
  if (!asset.mimeType.startsWith("image/")) {
    stream.destroy();
    return { error: "not_an_image" };
  }
  const data = await readAll(stream);
  const url = `data:${asset.mimeType};base64,${data.toString("base64")}`;
  const name = asset.name || "this image";

  const result = await getTextCapability().generateText({
    modelId: DESCRIBE_MODEL,
    instruction: `${(asset.kind && PROMPTS[asset.kind]) || PROMPTS.other} ${RULES}`,
    userId,
    temperature: 0.2,
    references: [{ kind: "image", url, name }],
  });
  // The mock echoes its instruction; a description should read like one.
  if (result.modelUsed === "mock") return { description: `[mock] A description of ${name}.` };
  return { description: cleanDescription(result.text) };
}

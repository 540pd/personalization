// Reference parsing for the generate routes: the upstream nodes a canvas
// generation is fed from.

import type { Reference } from "../capabilities/types.js";
import { cleanPromptName } from "../common/promptText.js";

// Accepts the current discriminated shape, the older { url, name } image
// shape, and a bare data-URL string, so a client that has not been redeployed
// still works -- it just sends an unnamed image reference. Names are cleaned
// like every name a prompt mentions (common/promptText).
// Text references travel in the prompt itself, so an unbounded one is a way to
// push arbitrary length at the model on someone else's behalf.
const MAX_REFERENCE_TEXT = 4000;

function cleanName(raw: unknown): string | undefined {
  return typeof raw === "string" ? cleanPromptName(raw) || undefined : undefined;
}

function toReference(raw: unknown): Reference | null {
  if (typeof raw === "string") return raw ? { kind: "image", url: raw } : null;
  if (typeof raw !== "object" || raw === null) return null;
  const { kind, url, text, name } = raw as Record<string, unknown>;

  if (kind === "text") {
    if (typeof text !== "string") return null;
    // Newlines are meaningful in a text reference, so only strip the rest.
    const body = text.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, " ")
      .trim()
      .slice(0, MAX_REFERENCE_TEXT);
    return body ? { kind: "text", text: body, name: cleanName(name) } : null;
  }

  if (typeof url !== "string" || !url) return null;
  return { kind: "image", url, name: cleanName(name) };
}

/** Shared by every generate route: they differ only in model list and options. */
export function readReferences(raw: unknown): Reference[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const refs = (raw as unknown[]).map(toReference).filter((r): r is Reference => r !== null);
  return refs.length ? refs : undefined;
}

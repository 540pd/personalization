// Composing named references ahead of an instruction is identical for every
// model, so it lives here rather than inside one capability. It started in
// imagen.ts; a second copy in a text or video capability is how the two drift.

import type { Reference } from "./types.js";

export interface ContentPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

/**
 * Interleaves each reference with its own name, rather than sending the
 * references as an anonymous block followed by the prompt.
 *
 * Listing names in the prompt text ("references: sunset, logo") would make the
 * model map names to references by position, which is exactly the fragility
 * this removes. The parts array is ordered, so putting a name immediately
 * before its own reference lets an instruction address them directly.
 *
 * Unnamed references fall back to a positional name. Every reference needs
 * one: naming some but not others breaks the addressing for all of them.
 *
 * The positional fallback counts every reference, including ones that are
 * skipped for being malformed, so a name never silently shifts onto a
 * different reference than the user saw on the canvas.
 */
export function buildContentParts(
  prompt: string,
  references: Reference[] = []
): ContentPart[] {
  const parts: ContentPart[] = [];

  references.forEach((ref, i) => {
    const name = ref.name?.trim() || `Reference ${i + 1}`;

    if (ref.kind === "text") {
      const text = ref.text.trim();
      if (!text) return;
      // A text reference is one part: there is no payload to point at, so the
      // name and the content belong together.
      parts.push({ text: `Reference "${name}": ${text}` });
      return;
    }

    const match = ref.url.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return;
    parts.push({ text: `Reference "${name}":` });
    parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
  });

  parts.push({ text: prompt });
  return parts;
}

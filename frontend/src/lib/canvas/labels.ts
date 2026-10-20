// Node display names, and the one rule for keeping them distinct.
//
// A label is not just chrome: it is how a node is referred to when it feeds a
// downstream generation. Two nodes sharing a name is merely confusing on
// screen but genuinely ambiguous as model context, so every auto-generated
// label goes through uniqueLabel.

import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { useFrames } from "@/store/frame.store";

/** Matches a trailing " (2)", " (3)" ... so suffixes don't stack. */
const SUFFIX = /\s\((\d+)\)$/;

/**
 * Every label in use anywhere on the board.
 *
 * Both stores, because the two namespaces share one screen and one prompt: a
 * Create panel auto-named "cat" and an uploaded cat.png are equally "cat" to
 * a generation that references one of them. Checking only one store is how a
 * panel and an image end up with the same name.
 */
export function takenLabels(): string[] {
  const fromNodes  = Object.values(useKonvaNodes.getState().nodes).map((n) => n.label);
  const fromPanels = useNodePanel.getState().panels.map((p) => p.label);
  // Frames are named too, and share the screen with everything else.
  const fromFrames = Object.values(useFrames.getState().frames).map((f) => f.label);
  return [...fromNodes, ...fromPanels, ...fromFrames].filter((l): l is string => !!l);
}

/**
 * "cat" if free, else "cat (2)", "cat (3)", ...
 *
 * `base` is stripped of any existing suffix first: copying "cat (2)" yields
 * "cat (3)", not "cat (2) (2)".
 */
/**
 * The auto label for `base` on a node currently called `current`.
 *
 * Keeps `current` when it is already `base` or a suffixed `base (n)`, so
 * regenerating with the same prompt does not churn "cat (2)" into "cat (3)".
 * Otherwise a fresh unique name, not counting `current` itself as taken --
 * the node is giving that name up.
 */
export function relabel(current: string | undefined, base: string, taken: string[]): string {
  if (current && current.replace(SUFFIX, "") === base.replace(SUFFIX, "")) return current;
  return uniqueLabel(base, taken.filter((l) => l !== current));
}

export function uniqueLabel(base: string, taken: string[]): string {
  const stem = base.replace(SUFFIX, "");
  if (!taken.includes(stem)) return stem;
  let n = 2;
  while (taken.includes(`${stem} (${n})`)) n += 1;
  return `${stem} (${n})`;
}

// A generated node needs a name before it can be referenced by a downstream
// one, so derive a readable default from the instruction. Natural words rather
// than a slug: this string is also what a downstream generation refers to it
// by, and "Image 3" would be useless as context.
export function labelFromInstruction(instruction: string): string {
  const words = instruction.trim().split(/\s+/).slice(0, 6).join(" ");
  return words.length > 40 ? `${words.slice(0, 40).trimEnd()}…` : words;
}

// A Compose box's name comes from its first written line. Markdown markers
// ("# ", "> ", "- ", "1. ") are syntax, not words, so they are left out (#181).
export function labelFromText(text: string): string {
  const line = text.split("\n").find((l) => l.trim()) ?? "";
  return labelFromInstruction(line.replace(/^\s*(#{1,6}|>|[-*+]|\d+[.)])\s+/, ""));
}

import type { NodeKind, PanelInstance, PanelOutput } from "@/store/nodePanel.store";
import type { NodeKindSpec } from "../nodeKinds";
import { composeKind } from "./composeKind";
import { imageKind } from "./imageKind";
import { instructionKind } from "./instructionKind";
import { videoKind } from "./videoKind";

// Adding a kind: write its spec beside imageKind.tsx and register it here.
// Nothing else should need to change — if it does, the thing that needed
// changing was not kind-agnostic and that is the bug.
//
export const NODE_KINDS: Partial<Record<NodeKind, NodeKindSpec>> = {
  image: imageKind,
  instruction: instructionKind,
  video: videoKind,
  compose: composeKind,
};

export function kindSpec(kind: NodeKind): NodeKindSpec {
  const spec = NODE_KINDS[kind];
  if (!spec) throw new Error(`No spec registered for node kind "${kind}"`);
  return spec;
}

/**
 * What a node holds to feed downstream: its generated output, or for an
 * authored kind, the text the user wrote. Undefined while there is nothing.
 */
export function panelOutput(p: PanelInstance): PanelOutput | undefined {
  if (p.output) return p.output;
  const text = p.draft?.instruction;
  return kindSpec(p.kind).authored && text?.trim() ? { type: "text", value: text } : undefined;
}

import type { NodeKind } from "@/store/nodePanel.store";
import type { NodeKindSpec } from "../nodeKinds";
import { imageKind } from "./imageKind";

// Adding a kind: write its spec beside imageKind.tsx and register it here.
// Nothing else should need to change — if it does, the thing that needed
// changing was not kind-agnostic and that is the bug.
//
// `video` and `instruction` are declared in tool.store.ts and appear in the
// dock already; they have no entry yet, so FloatingDock still no-ops on them.
export const NODE_KINDS: Partial<Record<NodeKind, NodeKindSpec>> = {
  image: imageKind,
};

export function kindSpec(kind: NodeKind): NodeKindSpec {
  const spec = NODE_KINDS[kind];
  if (!spec) throw new Error(`No spec registered for node kind "${kind}"`);
  return spec;
}

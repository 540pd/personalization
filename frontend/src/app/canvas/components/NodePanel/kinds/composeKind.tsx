"use client";

// node > compose — a text box the user writes in (#181).
//
// The one kind that is not generated. It has no models and no panel; the
// node edits its text in place on a double-click (see `authored` in
// nodeKinds). Output-only: it feeds a downstream node as a text reference,
// and nothing feeds it.

import { PencilLine } from "lucide-react";
import { DEFAULT_NODE_MAX_EDGE } from "@/constants/canvas.constants";
import type { NodeKindSpec } from "../nodeKinds";

// Sized like a Prompt node: both are reading surfaces, not pictures.
const COMPOSE_NODE_SIZE = {
  w: DEFAULT_NODE_MAX_EDGE,
  h: Math.round(DEFAULT_NODE_MAX_EDGE * 0.75),
};

function EmptyState() {
  return (
    <div className="node-panel-placeholder-content">
      <PencilLine size={28} strokeWidth={1.4} aria-hidden className="node-panel-image-icon" />
      <span className="node-panel-placeholder-text">Double-click to write</span>
    </div>
  );
}

// Scrolls inside the node, as a Prompt node's output does.
function Output({ value }: { value: string }) {
  return <div className="node-panel-text-output">{value}</div>;
}

export const composeKind: NodeKindSpec = {
  kind: "compose",
  title: "Compose",
  prompt: "",
  models: [],
  defaultSettings: {},
  sizeFor: () => COMPOSE_NODE_SIZE,
  EmptyState,
  Output,
  acceptsInput: false,
  authored: true,
  async generate() {
    // Never called: an authored kind has no panel to submit.
    throw new Error("A Compose box is written, not generated.");
  },
};

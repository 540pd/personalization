"use client";

// node > compose — a text box the user writes in (#181).
//
// The one kind that is not generated. It has no models and no panel; the
// node edits its text in place on a double-click (see `authored` in
// nodeKinds). Output-only: it feeds a downstream node as a text reference,
// and nothing feeds it.

import { lazy, Suspense } from "react";
import { PencilLine } from "lucide-react";
import type { NodeKindSpec, NodeOutputProps } from "../nodeKinds";
import { TEXT_NODE_SIZE, TextOutput } from "./controls";

function EmptyState() {
  return (
    <div className="node-panel-placeholder-content">
      <PencilLine size={28} strokeWidth={1.4} aria-hidden className="node-panel-image-icon" />
      <span className="node-panel-placeholder-text">Double-click to write</span>
    </div>
  );
}

// Keep the Markdown packages out of the initial canvas bundle. The separate
// renderer is fetched only when a written Compose box has content to display.
const MarkdownOutput = lazy(() => import("./ComposeMarkdownOutput"));

function Output(props: NodeOutputProps) {
  return (
    <Suspense fallback={<TextOutput value={props.value} />}>
      <MarkdownOutput {...props} />
    </Suspense>
  );
}

export const composeKind: NodeKindSpec = {
  kind: "compose",
  title: "Compose",
  prompt: "",
  models: [],
  defaultSettings: {},
  // Sized like a Prompt node: both are reading surfaces, not pictures.
  sizeFor: () => TEXT_NODE_SIZE,
  EmptyState,
  Output,
  acceptsInput: false,
  authored: true,
  async generate() {
    // Never called: an authored kind has no panel to submit.
    throw new Error("A Compose box is written, not generated.");
  },
};

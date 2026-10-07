"use client";

// node > instruction — a text node backed by Gemini.
//
// The honest test of the kind registry: it is synchronous, has no binary
// payload, and is NOT aspect-ratio driven. If expressing it needs a change
// anywhere outside this file, something that should be kind-agnostic is not.

import { generateText } from "@/api/canvas.api";
import { DEFAULT_NODE_MAX_EDGE } from "@/constants/canvas.constants";
import type { InstructionSettings, NodeKindSpec, SettingsProps } from "../nodeKinds";

// Ids from docs/llm_parameter/, not guessed.
const MODELS = [
  { id: "gemini-3.8-flash",      label: "Gemini 3.8 Flash" },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite" },
];

// A text node is a reading surface, not a picture: a squat landscape box wastes
// the width on short lines, so it defaults taller than it is wide.
const TEXT_NODE_SIZE = {
  w: DEFAULT_NODE_MAX_EDGE,
  h: Math.round(DEFAULT_NODE_MAX_EDGE * 0.75),
};

function Advanced({ value, onChange }: SettingsProps) {
  const s = value as InstructionSettings;
  return (
    <div className="node-panel-advanced-content">
      <div className="node-panel-temperature">
        <div className="node-panel-temperature-header">
          <p className="node-panel-setting-label">Temperature</p>
          <span className="node-panel-temperature-value">{s.temperature.toFixed(1)}</span>
        </div>

        <div className="node-panel-temperature-slider">
          <span className="node-panel-range-label">0</span>
          <input
            type="range"
            aria-label="Temperature"
            min={0}
            max={2}
            step={0.1}
            value={s.temperature}
            onChange={(e) => onChange({ ...s, temperature: Number(e.target.value) })}
            className="node-panel-range"
          />
          <span className="node-panel-range-label">2</span>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="node-panel-placeholder-content">
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="node-panel-image-icon"
      >
        <path d="M4 7V5h16v2" />
        <path d="M12 5v14" />
        <path d="M9 19h6" />
      </svg>

      <span className="node-panel-placeholder-text">
        Text will
        <br />
        appear here
      </span>
    </div>
  );
}

// Scrolls inside the node rather than overflowing it: the node is resizable,
// and long output must stay within whatever box the user has dragged.
function Output({ value }: { value: string }) {
  return <div className="node-panel-text-output">{value}</div>;
}

export const instructionKind: NodeKindSpec = {
  kind: "instruction",
  title: "Instruction",
  prompt: "What should this node work out?",
  models: MODELS,
  defaultSettings: { temperature: 0.7 },
  // Fixed: nothing in the settings changes a text node's shape.
  sizeFor: () => TEXT_NODE_SIZE,
  EmptyState,
  Output,
  Advanced,
  // No Options row — a text node has no aspect ratio or quality to choose.
  async generate({ modelId, instruction, settings, references }) {
    const s = settings as InstructionSettings;
    const result = await generateText({
      modelId,
      instruction,
      temperature: s.temperature,
      references: references.length ? references : undefined,
    });
    if (!result.text) throw new Error("Generation returned no text.");
    return { type: "text", value: result.text };
  },
};

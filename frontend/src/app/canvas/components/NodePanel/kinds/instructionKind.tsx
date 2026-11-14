"use client";

// node > instruction — a text node backed by Gemini.
//
// The honest test of the kind registry: it is synchronous, has no binary
// payload, and is NOT aspect-ratio driven. If expressing it needs a change
// anywhere outside this file, something that should be kind-agnostic is not.

import { generateText } from "@/api/canvas.api";
import type { InstructionSettings, NodeKindSpec, SettingsProps } from "../nodeKinds";
import { baseRequest, brandRequest, KindPlaceholder, TemperatureSlider, TEXT_NODE_SIZE, TextOutput } from "./controls";

// Ids from docs/llm_parameter/, not guessed.
const MODELS = [
  { id: "gemini-3.8-flash",      label: "Gemini 3.8 Flash" },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite", hint: "Lowest cost. Good for trying an idea first." },
];

function Advanced({ value, onChange }: SettingsProps) {
  const s = value as InstructionSettings;
  return (
    <div className="node-panel-advanced-content">
      <TemperatureSlider value={s.temperature} onChange={(temperature) => onChange({ ...s, temperature })} />
    </div>
  );
}

function EmptyState() {
  return (
    <KindPlaceholder
      noun="Text"
      icon={<>
        <path d="M4 7V5h16v2" />
        <path d="M12 5v14" />
        <path d="M9 19h6" />
      </>}
    />
  );
}

export const instructionKind: NodeKindSpec = {
  kind: "instruction",
  title: "Prompt",
  prompt: "What should this node work out?",
  // An agent is a saved Prompt setup, so only here does @ offer agents too.
  mentions: "skills-and-agents",
  brand: true,
  models: MODELS,
  // Same principle as the other kinds: default to the lite model.
  defaultModel: "gemini-3.5-flash-lite",
  // 0 by default: the same instruction should give the same answer back.
  defaultSettings: { temperature: 0 },
  // Fixed: nothing in the settings changes a text node's shape.
  sizeFor: () => TEXT_NODE_SIZE,
  EmptyState,
  Output: TextOutput,
  Advanced,
  // No Options row — a text node has no aspect ratio or quality to choose.
  async generate({ modelId, instruction, settings, references, context, onBrandFailed, signal }) {
    const s = settings as InstructionSettings;
    const result = await generateText({
      modelId,
      instruction,
      temperature: s.temperature,
      ...baseRequest(references, context),
      // An agent is a saved Prompt setup, so only a text request carries one.
      ...(context?.agent ? { agent: context.agent } : {}),
      brand: brandRequest(settings),
    }, signal);
    if (result.brand?.failed) onBrandFailed?.();
    if (!result.text) throw new Error("Generation returned no text.");
    return { type: "text", value: result.text };
  },
};

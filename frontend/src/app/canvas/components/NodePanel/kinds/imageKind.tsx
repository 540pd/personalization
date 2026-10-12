"use client";

// Luma reference: IMG-01 (model picker), IMG-02/03 (Create Image panel).
// Everything specific to a Create Image node lives here; the panel shell and
// the form are kind-agnostic.

import { generateImageV2 } from "@/api/canvas.api";
import type { AspectRatioV2 } from "@/types/canvas.types";
import { DEFAULT_ASPECT_RATIO, placeholderSize } from "@/constants/canvas.constants";
import type { ImageSettings, NodeKindSpec, SettingsProps } from "../nodeKinds";

// To add a new model: append an entry with the Vertex AI model ID as `id` and
// the display name as `label`. The `id` value is sent verbatim to the backend
// POST /api/generate/image as the `modelId` field.
// Example:
//   { id: "gemini-3.2-flash-image", label: "Nano Banana 3" },
// Capabilities transcribed from docs/llm_parameter. Grounding is absent from
// every image sample -- only the text models use google_search -- so no image
// model offers it.
const MODELS = [
  { id: "gemini-3.1-flash-image",      label: "Nano Banana 2",
    supports: { temperature: true,  thinking: true,  imageSize: true, aspectRatio: true } },
  { id: "gemini-3.1-flash-lite-image", label: "Nano Banana 2 Lite",
    supports: { temperature: true,  thinking: true,  imageSize: true, aspectRatio: true } },
  // Pro sets no thinking_config.
  { id: "gemini-3-pro-image",          label: "Nano Banana Pro",
    supports: { temperature: true,  thinking: false, imageSize: true, aspectRatio: true } },
  // 2.1 sets no temperature.
  { id: "gemini-nano-banana-2.1",      label: "Nano Banana 2.1",
    supports: { temperature: false, thinking: true,  imageSize: true, aspectRatio: true } },
];

const ASPECT_RATIOS = ["16:9", "1:1", "9:16", "4:3", "3:4"];
const QUALITIES     = ["1K", "2K", "4K"];
const THINKING_OPTS = ["None", "Minimal", "Full"];

function Advanced({ value, onChange, supports }: SettingsProps) {
  const s = value as ImageSettings;
  return (
    <div className="node-panel-advanced-content">
      {supports.thinking && (
        <div className="node-panel-advanced-row">
          <div className="node-panel-setting">
            <p className="node-panel-setting-label">Thinking</p>
            <select
              value={s.thinking}
              onChange={(e) => onChange({ ...s, thinking: e.target.value })}
              className="node-panel-select"
            >
              {THINKING_OPTS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {supports.temperature && (
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
      )}
    </div>
  );
}

function Options({ value, onChange, supports }: SettingsProps) {
  const s = value as ImageSettings;
  return (
    <div className="node-panel-options">
      {supports.aspectRatio && (
      <div className="node-panel-option">
        <select
          aria-label="Aspect ratio"
          value={s.aspectRatio}
          onChange={(e) => onChange({ ...s, aspectRatio: e.target.value })}
          className="node-panel-option-select"
        >
          {ASPECT_RATIOS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </div>
      )}

      {supports.imageSize && (
      <div className="node-panel-option">
        <select
          aria-label="Quality"
          value={s.quality}
          onChange={(e) => onChange({ ...s, quality: e.target.value })}
          className="node-panel-option-select"
        >
          {QUALITIES.map((q) => (
            <option key={q}>{q}</option>
          ))}
        </select>
      </div>
      )}
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
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>

      <span className="node-panel-placeholder-text">
        Image will
        <br />
        appear here
      </span>
    </div>
  );
}

function Output({ value }: { value: string }) {
  // next/image is for optimising served assets. This is a data URL produced
  // in-session and drawn inside a canvas node at a size the user controls by
  // dragging, so there is nothing for the loader to do.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={value} alt="Generated preview" className="node-panel-preview" />;
}

export const imageKind: NodeKindSpec = {
  kind: "image",
  inputPortType: "IMAGE",
  outputPortType: "IMAGE",
  title: "Create Image",
  prompt: "Describe the image...",
  models: MODELS,
  // Cheapest model and smallest size by default. A node is usually created to
  // try an idea, and the picker is right there when a draft is worth a better
  // render.
  defaultModel: "gemini-3.1-flash-lite-image",
  defaultSettings: {
    aspectRatio: DEFAULT_ASPECT_RATIO,
    quality: "1K",
    thinking: "Minimal",
    // 0 by default: the same prompt should give the same picture back.
    temperature: 0,
  },
  sizeFor: (s) => placeholderSize((s as ImageSettings).aspectRatio),
  EmptyState,
  Output,
  Advanced,
  Options,
  async generate({ modelId, instruction, settings, references }) {
    const s = settings as ImageSettings;
    const result = await generateImageV2({
      modelId,
      instruction,
      aspectRatio: s.aspectRatio as AspectRatioV2,
      // Sent as-is: the backend maps quality onto imageConfig.imageSize and
      // the Thinking label onto a ThinkingLevel. Collapsing them here is how
      // both controls ended up doing nothing.
      quality: s.quality,
      thinking: s.thinking,
      temperature: s.temperature,
      references: references.length ? references : undefined,
    });
    if (!result.imageUrl) throw new Error("Generation returned no image.");
    return { type: "image", value: result.imageUrl };
  },
};

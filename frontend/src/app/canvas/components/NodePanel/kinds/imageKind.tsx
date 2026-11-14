"use client";

// Luma reference: IMG-01 (model picker), IMG-02/03 (Create Image panel).
// Everything specific to a Create Image node lives here; the panel shell and
// the form are kind-agnostic.

import { generateImageV2 } from "@/api/canvas.api";
import type { AspectRatioV2, Reference } from "@/types/canvas.types";
import { DEFAULT_ASPECT_RATIO, placeholderSize } from "@/constants/canvas.constants";
import type { ImageSettings, NodeKindSpec, NodeSettings, SettingsProps } from "../nodeKinds";
import type { MentionContext } from "../../../mentions/mentions";
import { baseRequest, brandRequest, KindPlaceholder, SettingSelect, TemperatureSlider } from "./controls";

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
    hint: "Lowest cost. Good for trying an idea first.",
    supports: { temperature: true,  thinking: true,  imageSize: true, aspectRatio: true } },
  // Pro sets no thinking_config.
  { id: "gemini-3-pro-image",          label: "Nano Banana Pro",
    hint: "Thinking can't be set for this model.",
    supports: { temperature: true,  thinking: false, imageSize: true, aspectRatio: true } },
  // 2.1 sets no temperature.
  { id: "gemini-nano-banana-2.1",      label: "Nano Banana 2.1",
    hint: "Temperature can't be set for this model.",
    supports: { temperature: false, thinking: true,  imageSize: true, aspectRatio: true } },
];

const ASPECT_RATIOS = ["16:9", "1:1", "9:16", "4:3", "3:4"];
const QUALITIES     = ["1K", "2K", "4K"];
const THINKING_OPTS = ["None", "Minimal", "Full"];
// Each variant is a separate billed call (see the backend's
// generateImageVariants), so the cap is a spend control. A select rather than
// a number input: nothing out of range can be typed in the first place.
const MAX_VARIANTS = 10;
const VARIANT_OPTS = Array.from({ length: MAX_VARIANTS }, (_, i) => i + 1);

function Advanced({ value, onChange, supports }: SettingsProps) {
  const s = value as ImageSettings;
  return (
    <div className="node-panel-advanced-content">
      {supports.thinking && (
        <div className="node-panel-advanced-row">
          <SettingSelect
            variant="setting"
            label="Thinking"
            options={THINKING_OPTS}
            value={s.thinking}
            onChange={(thinking) => onChange({ ...s, thinking })}
          />
        </div>
      )}

      {supports.temperature && (
        <TemperatureSlider value={s.temperature} onChange={(temperature) => onChange({ ...s, temperature })} />
      )}
    </div>
  );
}

function Options({ value, onChange, supports }: SettingsProps) {
  const s = value as ImageSettings;
  return (
    <div className="node-panel-options">
      {supports.aspectRatio && (
        <SettingSelect
          variant="option"
          label="Aspect ratio"
          options={ASPECT_RATIOS}
          value={s.aspectRatio}
          onChange={(aspectRatio) => onChange({ ...s, aspectRatio })}
        />
      )}

      {supports.imageSize && (
        <SettingSelect
          variant="option"
          label="Quality"
          options={QUALITIES}
          value={s.quality}
          onChange={(quality) => onChange({ ...s, quality })}
        />
      )}

      {/* A bare count beside "16:9" and "1K" could mean anything, so the
          multiplier reads as "this many" at a glance, and the label says
          what of -- on hover, and to a screen reader, which has no hover. */}
      <SettingSelect
        variant="option"
        label="Images"
        title="Images"
        options={VARIANT_OPTS}
        value={s.variants}
        format={(n) => `×${n}`}
        onChange={(n) => onChange({ ...s, variants: Number(n) })}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <KindPlaceholder
      noun="Image"
      icon={<>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </>}
    />
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
  title: "Create Image",
  prompt: "Describe the image...",
  // Skills only: an agent is a Prompt-panel setup with a text model (#240).
  mentions: "skills",
  caption: "@ for skills",
  brand: true,
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
    variants: 1,
  },
  sizeFor: (s) => placeholderSize((s as ImageSettings).aspectRatio),
  EmptyState,
  Output,
  Advanced,
  Options,
  async generate({ modelId, instruction, settings, references, context, onBrandFailed, signal }) {
    const result = await generateImageV2(requestFor(modelId, instruction, settings, references, context), signal);
    if (result.brand?.failed) onBrandFailed?.();
    if (!result.imageUrl) throw new Error("Generation returned no image.");
    return { type: "image", value: result.imageUrl };
  },
  variantCount: (settings) => (settings as ImageSettings).variants ?? 1,
  async generateVariants({ modelId, instruction, settings, references, context, onBrandFailed, signal }, count) {
    const result = await generateImageV2({
      ...requestFor(modelId, instruction, settings, references, context),
      variants: count,
    }, signal);
    if (result.brand?.failed) onBrandFailed?.();
    const urls = result.imageUrls ?? [];
    // A backend from before variants (#113) ignores the count and answers in
    // the single-image shape. Say that, rather than "no images" -- one did
    // come back, and the fix is on the server, not in the prompt.
    if (!urls.length && result.imageUrl) {
      throw new Error("This server can only make one image at a time. Set Images to ×1, or update the backend.");
    }
    if (!urls.length) throw new Error("Generation returned no images.");
    return { urls, failed: count - urls.length };
  },
};

function requestFor(
  modelId: string,
  instruction: string,
  settings: NodeSettings,
  references: Reference[],
  context?: MentionContext
) {
  const s = settings as ImageSettings;
  return {
    modelId,
    instruction,
    aspectRatio: s.aspectRatio as AspectRatioV2,
    // Sent as-is: the backend maps quality onto imageConfig.imageSize and
    // the Thinking label onto a ThinkingLevel. Collapsing them here is how
    // both controls ended up doing nothing.
    quality: s.quality,
    thinking: s.thinking,
    temperature: s.temperature,
    ...baseRequest(references, context),
    brand: brandRequest(settings),
  };
}

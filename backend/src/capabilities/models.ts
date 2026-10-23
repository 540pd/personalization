// The models each generate route accepts. A new model is added here, and only
// here; the route reads its allow-list from this module.

import type { AspectRatioV2 } from "./types.js";

/** POST /api/generate/image: Nano Banana image generation. */
export const VALID_MODELS = new Set([
  "gemini-3.1-flash-image",
  "gemini-3.1-flash-lite-image",
  "gemini-3-pro-image",
  "gemini-nano-banana-2.1",
]);
export const VALID_ASPECT_RATIOS_V2: AspectRatioV2[] = ["1:1", "16:9", "9:16", "4:3", "3:4"];

// POST /api/generate/text, backing the node > instruction canvas node.
// Ids from docs/llm_parameter/, which are the project's own working samples.
export const VALID_TEXT_MODELS = new Set([
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
]);

// POST /api/generate/video.
// Veo only for now. Gemini Omni 1.1 Flash needs client.interactions, which
// @google/genai 2.24.0 does not expose -- see the note in veo.ts.
export const VALID_VIDEO_MODELS = new Set([
  "veo-3.1-lite-generate-001",
]);

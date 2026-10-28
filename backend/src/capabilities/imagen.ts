// Vertex AI image generation using the Google Gen AI SDK (@google/genai).
//
// Mock fallback: if VERTEX_PROJECT_ID is not set, return a placeholder image
// drawn here (#335), at the requested shape, with a console.warn rather than
// throwing. This lets the backend start and serve requests locally without
// GCP credentials, and with no network.

import type {
  ImageCapability,
  ImageGenerationResult,
  ImageGenerationV2Params,
  Reference,
} from "./types.js";
import { buildContentParts } from "./prompt.js";
import { makeGenAI } from "./genai.js";
import { placeholderImageUrl } from "./placeholderImage.js";


// Our Thinking control's labels, mapped onto the SDK's ThinkingLevel. The
// samples in docs/llm_parameter use MINIMAL and MEDIUM; the enum also has
// LOW and HIGH. "None" maps to MINIMAL rather than omitting the config, so
// the choice is always explicit in the request.
const THINKING_LEVEL: Record<string, string> = {
  None:    "MINIMAL",
  Minimal: "MINIMAL",
  Full:    "HIGH",
};

export class ImagenCapability implements ImageCapability {
  async generateV2(params: ImageGenerationV2Params): Promise<ImageGenerationResult> {
    if (!process.env.VERTEX_PROJECT_ID) {
      console.warn(
        `[ImagenCapability] VERTEX_PROJECT_ID not set — returning mock for ${params.modelId}.`
      );
      return { imageUrl: placeholderImageUrl(params.aspectRatio), modelUsed: "mock" };
    }

    const ai = makeGenAI();

    // Shaped from docs/llm_parameter/. Three panel controls -- aspect ratio,
    // quality and thinking -- previously reached the model as nothing at
    // all: quality and thinking were dropped on the floor, and the aspect
    // ratio was appended to the prompt as prose ("Image dimensions:
    // landscape (16:9 aspect ratio).") rather than set as config, which is
    // why a requested ratio could drift.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: Record<string, any> = {
      // TEXT as well as IMAGE: the samples ask for both, and a model that
      // wants to explain a refusal has nowhere to put it otherwise.
      responseModalities: ["TEXT", "IMAGE"],
      maxOutputTokens: 32768,
      topP: 0.95,
      imageConfig: {
        aspectRatio: params.aspectRatio,
        outputMimeType: "image/png",
      },
    };

    if (typeof params.temperature === "number") {
      config["temperature"] = params.temperature;
    }
    // The panel's 1K / 2K / 4K control. imageSize takes those values
    // directly; it used to be squashed into a "standard" | "hd" pair that
    // nothing then read.
    if (params.imageSize) {
      config["imageConfig"]["imageSize"] = params.imageSize;
    }
    if (params.thinking) {
      config["thinkingConfig"] = {
        thinkingLevel: THINKING_LEVEL[params.thinking] ?? "MINIMAL",
      };
    }

    const parts = buildContentParts(params.instruction, params.references);

    const response = await ai.models.generateContent({
      model: params.modelId,
      contents: [{ role: "user", parts }],
      config,
    });

    // Extract inline image data from the first candidate.
    const responseParts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = responseParts.find((p) => p.inlineData?.data);

    if (!imagePart?.inlineData) {
      throw new Error(
        `Model ${params.modelId} returned no image data. ` +
          "Check that the model supports image generation and the project has quota."
      );
    }

    const { mimeType, data } = imagePart.inlineData;
    return {
      imageUrl: `data:${mimeType};base64,${data}`,
      modelUsed: params.modelId,
    };
  }
}

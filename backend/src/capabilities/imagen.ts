// Vertex AI image generation using the Google Gen AI SDK (@google/genai).
//
// Mock fallback: if VERTEX_PROJECT_ID is not set, return a placeholder result
// with a console.warn rather than throwing. This lets the backend start and
// serve requests locally without GCP credentials.

import { GoogleGenAI } from "@google/genai";
import type {
  ImageCapability,
  ImageGenerationParams,
  ImageGenerationResult,
  ImageGenerationV2Params,
  AspectRatioV2,
  ReferenceImage,
} from "./types.js";

export interface ContentPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

/**
 * Interleaves each reference image with its own name, rather than sending the
 * images as an anonymous block followed by the prompt.
 *
 * Listing names in the prompt text ("references: sunset, logo") would make the
 * model map names to images by position, which is exactly the fragility this
 * removes. The parts array is ordered, so putting a name immediately before
 * its own image lets an instruction address them directly.
 *
 * Unnamed references fall back to a positional name. Every reference needs
 * one: naming some but not others breaks the addressing for all of them.
 */
export function buildContentParts(
  prompt: string,
  references: ReferenceImage[] = []
): ContentPart[] {
  const parts: ContentPart[] = [];
  references.forEach((ref, i) => {
    const match = ref.url.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return;
    const name = ref.name?.trim() || `Reference ${i + 1}`;
    parts.push({ text: `Reference "${name}":` });
    parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
  });
  parts.push({ text: prompt });
  return parts;
}

const MOCK_IMAGE_URL =
  "https://via.placeholder.com/1024x1024/1a1a1a/666666?text=Mock+Image";

// Human-readable hint appended to the prompt so models without a structured
// aspect-ratio param still honour the requested dimensions.
const ASPECT_LABEL: Record<AspectRatioV2, string> = {
  "1:1":  "square (1:1 aspect ratio)",
  "16:9": "landscape (16:9 aspect ratio)",
  "9:16": "portrait (9:16 aspect ratio)",
  "4:3":  "standard (4:3 aspect ratio)",
  "3:4":  "portrait (3:4 aspect ratio)",
};

function makeGenAI(): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT_ID!,
    location: process.env.VERTEX_LOCATION ?? "global",
  });
}

export class ImagenCapability implements ImageCapability {
  async generate(params: ImageGenerationParams): Promise<ImageGenerationResult> {
    if (!process.env.VERTEX_PROJECT_ID) {
      console.warn(
        "[ImagenCapability] VERTEX_PROJECT_ID not set — returning mock image. " +
          "Set VERTEX_PROJECT_ID to enable real generation."
      );
      return { imageUrl: MOCK_IMAGE_URL, modelUsed: "mock" };
    }

    // Legacy endpoint — delegates to generateV2 using the default model.
    return this.generateV2({
      modelId: "gemini-3.1-flash-image",
      instruction: params.prompt,
      aspectRatio: params.aspectRatio,
      userId: params.userId,
    });
  }

  async generateV2(params: ImageGenerationV2Params): Promise<ImageGenerationResult> {
    if (!process.env.VERTEX_PROJECT_ID) {
      console.warn(
        `[ImagenCapability] VERTEX_PROJECT_ID not set — returning mock for ${params.modelId}.`
      );
      return { imageUrl: MOCK_IMAGE_URL, modelUsed: "mock" };
    }

    const ai = makeGenAI();

    const prompt = `${params.instruction}\n\nImage dimensions: ${ASPECT_LABEL[params.aspectRatio]}.`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: Record<string, any> = {
      responseModalities: ["IMAGE"],
    };
    if (typeof params.temperature === "number") {
      config["temperature"] = params.temperature;
    }

    const parts = buildContentParts(prompt, params.referenceImages);

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

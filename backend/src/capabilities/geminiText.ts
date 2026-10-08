// Gemini text generation, backing the node > instruction canvas node.
//
// Mock fallback: if VERTEX_PROJECT_ID is not set, return placeholder text with
// a console.warn rather than throwing, matching ImagenCapability. This lets
// the backend serve the instruction node locally without GCP credentials.

import { GoogleGenAI } from "@google/genai";
import type {
  TextCapability,
  TextGenerationParams,
  TextGenerationResult,
} from "./types.js";
import { buildContentParts } from "./prompt.js";

function makeGenAI(): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT_ID!,
    location: process.env.VERTEX_LOCATION ?? "global",
  });
}

// Echoes the instruction so a developer can see the request reached the
// backend and which references travelled with it. A fixed lorem string would
// make a wiring bug look like a working node.
function mockText(params: TextGenerationParams): string {
  const refs = params.references?.length
    ? ` (with ${params.references.length} reference${params.references.length > 1 ? "s" : ""}: ` +
      `${params.references.map((r, i) => r.name?.trim() || `Reference ${i + 1}`).join(", ")})`
    : "";
  return `[mock] ${params.instruction}${refs}`;
}

export class GeminiTextCapability implements TextCapability {
  async generateText(params: TextGenerationParams): Promise<TextGenerationResult> {
    if (!process.env.VERTEX_PROJECT_ID) {
      console.warn(
        `[GeminiTextCapability] VERTEX_PROJECT_ID not set — returning mock for ${params.modelId}.`
      );
      return { text: mockText(params), modelUsed: "mock" };
    }

    const ai = makeGenAI();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: Record<string, any> = { responseModalities: ["TEXT"] };
    if (typeof params.temperature === "number") {
      config["temperature"] = params.temperature;
    }

    const parts = buildContentParts(params.instruction, params.references);

    const response = await ai.models.generateContent({
      model: params.modelId,
      contents: [{ role: "user", parts }],
      config,
    });

    // A response can be split across several text parts; joining them is not
    // optional, taking the first would silently truncate.
    const text = (response.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();

    if (!text) {
      throw new Error(
        `Model ${params.modelId} returned no text. ` +
          "Check that the model supports text generation and the project has quota."
      );
    }

    return { text, modelUsed: params.modelId };
  }
}

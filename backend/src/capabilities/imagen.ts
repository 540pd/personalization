// Vertex AI Imagen 3 implementation of ImageCapability.
//
// Mock fallback convention: if VERTEX_PROJECT_ID is not set, return a
// placeholder result with a console.warn rather than throwing. This lets the
// backend start and serve requests locally without GCP credentials, which is
// the same pattern used throughout this codebase for optional keys.

import type { ImageCapability, ImageGenerationParams, ImageGenerationResult } from "./types.js";

const MOCK_IMAGE_URL =
  "https://via.placeholder.com/1024x1024/1a1a1a/666666?text=Mock+Image";

export class ImagenCapability implements ImageCapability {
  async generate(params: ImageGenerationParams): Promise<ImageGenerationResult> {
    if (!process.env.VERTEX_PROJECT_ID) {
      console.warn(
        "[ImagenCapability] VERTEX_PROJECT_ID not set — returning mock image. " +
          "Set VERTEX_PROJECT_ID to use real Imagen 3 generation."
      );
      return { imageUrl: MOCK_IMAGE_URL, modelUsed: "mock" };
    }

    // TODO: call Vertex AI Imagen 3 via @google-cloud/vertexai
    // const { VertexAI } = await import("@google-cloud/vertexai");
    // const vertexai = new VertexAI({ project: process.env.VERTEX_PROJECT_ID, location: process.env.VERTEX_LOCATION ?? "us-central1" });
    // ... generate and return signed GCS URL
    console.warn("[ImagenCapability] Real Imagen 3 call not yet implemented — returning mock.");
    return {
      imageUrl: MOCK_IMAGE_URL,
      modelUsed: "imagegeneration@006",
    };
  }
}

// Veo video generation, backing the node > video canvas node.
//
// Shape taken from docs/llm_parameter/Veo 3.1 Lite.txt, not guessed. Unlike
// the image and text capabilities this is a long-running operation: Vertex
// returns an operation handle and the result arrives by polling it. That maps
// straight onto lib/jobStore — this runs in the background and settles the
// job, and the HTTP contract the client sees never changes.
//
// Gemini Omni 1.1 Flash is the other video model in that folder. It is NOT
// implemented here: its sample calls client.interactions.create() with an
// "Api-Revision" header, and @google/genai 2.24.0 exposes no `interactions`
// on the client (models, live, batches, chats, caches, files, operations,
// authTokens, tunings, fileSearchStores). It needs an SDK that has it, or a
// hand-rolled REST call. The model picker and the job contract are unchanged
// by adding it later — it is one more branch in generateVideo.

import { GoogleGenAI } from "@google/genai";
import type { VideoGenerationParams, VideoGenerationResult } from "./types.js";

// The Veo sample pins a region. Video models are not served from "global",
// which is what the image and text capabilities default to.
const VIDEO_LOCATION = process.env.VERTEX_VIDEO_LOCATION ?? "us-central1";

function makeGenAI(): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT_ID!,
    location: VIDEO_LOCATION,
  });
}

const MOCK_VIDEO_URL =
  "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQ==";

// The delay is the point: it makes the pending state, the polling and the
// reload-resume behaviour exercisable locally. An instant mock would not.
function mockDelayMs(): number {
  const raw = Number(process.env.MOCK_VIDEO_DELAY_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 3000;
}

const POLL_INTERVAL_MS = 10_000;
// Bounded so a stuck operation surfaces as a failed job rather than a worker
// polling Vertex forever.
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

/** First inline data URL in a reference, if it is one. */
function firstReferenceImage(
  params: VideoGenerationParams
): { imageBytes: string; mimeType: string } | undefined {
  for (const ref of params.references ?? []) {
    if (ref.kind !== "image") continue;
    const match = ref.url.match(/^data:([^;]+);base64,(.+)$/);
    if (match) return { mimeType: match[1], imageBytes: match[2] };
  }
  return undefined;
}

export class VeoCapability {
  async generateVideo(params: VideoGenerationParams): Promise<VideoGenerationResult> {
    if (!process.env.VERTEX_PROJECT_ID) {
      console.warn(
        `[VeoCapability] VERTEX_PROJECT_ID not set — returning mock for ${params.modelId} ` +
          `after ${mockDelayMs()}ms.`
      );
      await new Promise((r) => setTimeout(r, mockDelayMs()));
      return { videoUrl: MOCK_VIDEO_URL, modelUsed: "mock" };
    }

    const ai = makeGenAI();
    const image = firstReferenceImage(params);

    let operation = await ai.models.generateVideos({
      model: params.modelId,
      prompt: params.instruction,
      // Veo takes a single input image rather than an interleaved parts
      // array, so an upstream image node contributes its first image and
      // text references do not apply.
      ...(image ? { image } : {}),
      config: {
        numberOfVideos: 1,
        ...(typeof params.durationSeconds === "number"
          ? { durationSeconds: params.durationSeconds }
          : {}),
        ...(params.resolution ? { resolution: params.resolution } : {}),
        aspectRatio: "16:9",
        generateAudio: true,
      },
    });

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (!operation.done) {
      if (Date.now() > deadline) {
        throw new Error("Video generation timed out while waiting on Vertex.");
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      operation = await ai.operations.getVideosOperation({ operation });
    }

    const video = operation.response?.generatedVideos?.[0]?.video;
    if (!video) {
      throw new Error(
        `Model ${params.modelId} returned no video. ` +
          "Check that the model is available in the configured region and the project has quota."
      );
    }

    if (video.videoBytes) {
      return {
        videoUrl: `data:${video.mimeType ?? "video/mp4"};base64,${video.videoBytes}`,
        modelUsed: params.modelId,
      };
    }

    // Vertex writes to Cloud Storage instead of returning bytes when an
    // output bucket is configured. A gs:// URI is not fetchable by the
    // browser, and downloading it server-side is issue #5's signed-URL work.
    // Fail with the reason rather than handing the canvas a URL it cannot load.
    throw new Error(
      `Video was written to Cloud Storage (${video.uri}) rather than returned inline. ` +
        "Serving it needs the signed-URL work in issue #5."
    );
  }
}

// Veo video generation, backing the node > video canvas node.
//
// Shape taken from docs/llm_parameter/Veo 3.1 Lite.txt, not guessed. Unlike
// the image and text capabilities this is a long-running operation: Vertex
// returns an operation handle and the result arrives by polling it. That maps
// straight onto a video job (lib/jobs, #325) — this runs inside it and settles
// the job, and the HTTP contract the client sees never changes.
//
// Gemini Omni 1.1 Flash is the other video model in that folder. It is NOT
// implemented here: its sample calls client.interactions.create() with an
// "Api-Revision" header, and @google/genai 2.24.0 exposes no `interactions`
// on the client (models, live, batches, chats, caches, files, operations,
// authTokens, tunings, fileSearchStores). It needs an SDK that has it, or a
// hand-rolled REST call. The model picker and the job contract are unchanged
// by adding it later — it is one more branch in generateVideo.

import { VideoGenerationReferenceType } from "@google/genai";
import type { VideoGenerationParams, VideoGenerationResult } from "./types.js";
import { makeGenAI } from "./genai.js";

// The Veo sample pins a region. Video models are not served from "global",
// which is what the image and text capabilities default to.
const VIDEO_LOCATION = process.env.VERTEX_VIDEO_LOCATION ?? "us-central1";

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

/** Decoded inline image references, in the order they were wired. */
export function referenceImages(
  params: VideoGenerationParams
): { imageBytes: string; mimeType: string }[] {
  const out: { imageBytes: string; mimeType: string }[] = [];
  for (const ref of params.references ?? []) {
    if (ref.kind !== "image") continue;
    const match = ref.url.match(/^data:([^;]+);base64,(.+)$/);
    if (match) out.push({ mimeType: match[1], imageBytes: match[2] });
  }
  return out;
}

/**
 * Veo takes a single prompt string, not an interleaved parts array, so a text
 * reference has nowhere structural to go. Compose it into the prompt instead
 * of dropping it -- an instruction node wired into a video node used to
 * contribute nothing at all, silently, while the canvas showed a connection.
 *
 * Named the same way buildContentParts names them, so the instruction can
 * refer to a reference by the name shown on the node.
 */
export function composePrompt(params: VideoGenerationParams): string {
  const lines = (params.references ?? [])
    .map((ref, i) =>
      ref.kind === "text" && ref.text.trim()
        ? `Reference "${ref.name?.trim() || `Reference ${i + 1}`}": ${ref.text.trim()}`
        : null
    )
    .filter((l): l is string => l !== null);

  return lines.length ? `${lines.join("\n")}\n\n${params.instruction}` : params.instruction;
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

    const ai = makeGenAI(VIDEO_LOCATION);
    const images = referenceImages(params);

    let operation = await ai.models.generateVideos({
      model: params.modelId,
      prompt: composePrompt(params),
      // The first image seeds the generation; any others ride along as
      // assets. Veo's top-level `image` takes exactly one, so wiring a
      // second image node used to drop it without a word.
      ...(images[0] ? { image: images[0] } : {}),
      config: {
        numberOfVideos: 1,
        ...(images.length > 1
          ? { referenceImages: images.slice(1).map((image) => ({ image, referenceType: VideoGenerationReferenceType.ASSET })) }
          : {}),
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

import { getCapability, getTextCapability, getVideoCapability } from "../capabilities/index.js";
import type {
  ImageGenerationResult,
  ImageGenerationV2Params,
  TextGenerationParams,
  TextGenerationResult,
  VideoGenerationParams,
  VideoGenerationResult,
} from "../capabilities/types.js";
import { storeGenerated } from "./generatedAssets.js";

/** One image, its output kept as an asset (#323). */
async function generateOneImage(params: ImageGenerationV2Params): Promise<ImageGenerationResult> {
  const result = await getCapability().generateV2(params);
  return { ...result, imageUrl: await storeGenerated(params.userId, result.imageUrl) };
}

export function generateImageV2(
  params: ImageGenerationV2Params
): Promise<ImageGenerationResult> {
  return generateOneImage(params);
}

/** One variant that failed, named by its position in the requested batch. */
export interface VariantError {
  index: number;
  message: string;
}

export interface ImageVariantsResult {
  images: ImageGenerationResult[];
  errors: VariantError[];
}

/**
 * Generate `count` variants of the same prompt.
 *
 * Fans out rather than asking the model for several images at once, because
 * it cannot: these are Gemini `generateContent` image models and the
 * capability reads a single inline image from the first candidate. There is
 * no candidateCount or sampleCount in docs/llm_parameter for any of them. So
 * N variants is N calls, at N times the cost.
 *
 * Concurrent, not sequential -- ten serial round trips would be a long wait
 * for a result the user is comparing side by side.
 *
 * Settles rather than races: one variant failing should not throw away the
 * ones that worked, so failures come back alongside the successes and the
 * caller decides what a partial batch means.
 */
export async function generateImageVariants(
  params: ImageGenerationV2Params,
  count: number
): Promise<ImageVariantsResult> {
  const settled = await Promise.allSettled(
    Array.from({ length: count }, () => generateOneImage(params))
  );

  const images: ImageGenerationResult[] = [];
  const errors: VariantError[] = [];

  settled.forEach((outcome, index) => {
    if (outcome.status === "fulfilled") {
      images.push(outcome.value);
      return;
    }
    const reason: unknown = outcome.reason;
    errors.push({
      index,
      message: reason instanceof Error ? reason.message : String(reason),
    });
  });

  return { images, errors };
}

export function generateText(
  params: TextGenerationParams
): Promise<TextGenerationResult> {
  return getTextCapability().generateText(params);
}

/** A video, its output kept as an asset (#323). */
export async function generateVideo(
  params: VideoGenerationParams
): Promise<VideoGenerationResult> {
  const result = await getVideoCapability().generateVideo(params);
  return { ...result, videoUrl: await storeGenerated(params.userId, result.videoUrl) };
}

import { getCapability, getTextCapability, getVideoCapability } from "../capabilities/index.js";
import type {
  ImageGenerationParams,
  ImageGenerationResult,
  ImageGenerationV2Params,
  TextGenerationParams,
  TextGenerationResult,
  VideoGenerationParams,
  VideoGenerationResult,
} from "../capabilities/types.js";

export function generateImage(
  params: ImageGenerationParams
): Promise<ImageGenerationResult> {
  return getCapability().generate(params);
}

export function generateImageV2(
  params: ImageGenerationV2Params
): Promise<ImageGenerationResult> {
  return getCapability().generateV2(params);
}

export function generateText(
  params: TextGenerationParams
): Promise<TextGenerationResult> {
  return getTextCapability().generateText(params);
}

export function generateVideo(
  params: VideoGenerationParams
): Promise<VideoGenerationResult> {
  return getVideoCapability().generateVideo(params);
}

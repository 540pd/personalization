import { getCapability, getTextCapability } from "../capabilities/index.js";
import type {
  ImageGenerationParams,
  ImageGenerationResult,
  ImageGenerationV2Params,
  TextGenerationParams,
  TextGenerationResult,
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

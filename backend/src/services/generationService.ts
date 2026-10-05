import { getCapability } from "../capabilities/index.js";
import type {
  ImageGenerationParams,
  ImageGenerationResult,
  ImageGenerationV2Params,
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

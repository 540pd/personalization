export interface ImageGenerationParams {
  prompt: string;
  aspectRatio: "1:1" | "16:9" | "9:16" | "4:3";
  userId: string;
}

export type AspectRatioV2 = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

export interface ImageGenerationV2Params {
  modelId: string;
  instruction: string;
  aspectRatio: AspectRatioV2;
  userId: string;
  quality?: "standard" | "hd";
  thinking?: boolean;
  temperature?: number;
  grounding?: boolean;
  referenceImages?: string[]; // data URLs from upstream nodes in the canvas graph
}

export interface ImageGenerationResult {
  imageUrl: string;
  modelUsed: string;
}

export interface ImageCapability {
  generate(params: ImageGenerationParams): Promise<ImageGenerationResult>;
  generateV2(params: ImageGenerationV2Params): Promise<ImageGenerationResult>;
}

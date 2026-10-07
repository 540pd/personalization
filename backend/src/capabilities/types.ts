export interface ImageGenerationParams {
  prompt: string;
  aspectRatio: "1:1" | "16:9" | "9:16" | "4:3";
  userId: string;
}

export type AspectRatioV2 = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

export interface ReferenceImage {
  url: string;   // data URL
  name?: string; // display name of the source node
}

export interface ImageGenerationV2Params {
  modelId: string;
  instruction: string;
  aspectRatio: AspectRatioV2;
  userId: string;
  quality?: "standard" | "hd";
  thinking?: boolean;
  temperature?: number;
  grounding?: boolean;
  // Upstream nodes in the canvas graph. The name is how the model is told one
  // reference from another — without it, multiple references arrive as an
  // anonymous sequence and an instruction like "put the logo on the mug"
  // cannot say which image is which.
  referenceImages?: ReferenceImage[];
}

export interface ImageGenerationResult {
  imageUrl: string;
  modelUsed: string;
}

export interface ImageCapability {
  generate(params: ImageGenerationParams): Promise<ImageGenerationResult>;
  generateV2(params: ImageGenerationV2Params): Promise<ImageGenerationResult>;
}

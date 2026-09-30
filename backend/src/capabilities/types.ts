export interface ImageGenerationParams {
  prompt: string;
  aspectRatio: "1:1" | "16:9" | "9:16" | "4:3";
  userId: string;
}

export interface ImageGenerationResult {
  imageUrl: string;
  modelUsed: string;
}

export interface ImageCapability {
  generate(params: ImageGenerationParams): Promise<ImageGenerationResult>;
}

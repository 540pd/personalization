export interface ImageGenerationParams {
  prompt: string;
  aspectRatio: "1:1" | "16:9" | "9:16" | "4:3";
  userId: string;
}

export type AspectRatioV2 = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

// An upstream node feeding a generation. Discriminated because a text node
// has no payload to point at -- its content IS the reference -- while an image
// node carries a data URL that must travel as inlineData.
export type Reference =
  | { kind: "image"; url: string; name?: string }
  | { kind: "text"; text: string; name?: string };

/** @deprecated Use Reference. Kept so existing image call sites still read. */
export interface ReferenceImage {
  url: string;   // data URL
  name?: string; // display name of the source node
}

export interface ImageGenerationV2Params {
  modelId: string;
  instruction: string;
  aspectRatio: AspectRatioV2;
  userId: string;
  /** The panel's 1K / 2K / 4K control, passed straight to imageConfig. */
  imageSize?: string;
  /** The panel's Thinking label; mapped to a ThinkingLevel in the capability. */
  thinking?: string;
  temperature?: number;
  grounding?: boolean;
  // Upstream nodes in the canvas graph. The name is how the model is told one
  // reference from another — without it, multiple references arrive as an
  // anonymous sequence and an instruction like "put the logo on the mug"
  // cannot say which image is which.
  references?: Reference[];
}

export interface ImageGenerationResult {
  imageUrl: string;
  modelUsed: string;
}

export interface TextGenerationParams {
  modelId: string;
  instruction: string;
  userId: string;
  temperature?: number;
  references?: Reference[];
}

export interface TextGenerationResult {
  text: string;
  modelUsed: string;
}

export interface TextCapability {
  generateText(params: TextGenerationParams): Promise<TextGenerationResult>;
}

export interface VideoGenerationParams {
  modelId: string;
  instruction: string;
  userId: string;
  durationSeconds?: number;
  resolution?: string;
  references?: Reference[];
}

export interface VideoGenerationResult {
  videoUrl: string;
  modelUsed: string;
}

export interface VideoCapability {
  generateVideo(params: VideoGenerationParams): Promise<VideoGenerationResult>;
}

export interface ImageCapability {
  generate(params: ImageGenerationParams): Promise<ImageGenerationResult>;
  generateV2(params: ImageGenerationV2Params): Promise<ImageGenerationResult>;
}

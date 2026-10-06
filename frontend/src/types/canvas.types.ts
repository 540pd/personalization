export interface Board {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateImageParams {
  prompt: string;
  aspectRatio: "1:1" | "16:9" | "9:16" | "4:3";
}

export interface GenerateImageResult {
  jobId: string;
  status: "queued" | "generating" | "done" | "error";
  imageUrl?: string;
}

export type AspectRatioV2 = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

export interface ReferenceImage {
  url: string;
  name?: string;
}

export interface GenerateImageV2Params {
  modelId: string;
  instruction: string;
  aspectRatio: AspectRatioV2;
  quality?: "standard" | "hd";
  thinking?: boolean;
  temperature?: number;
  grounding?: boolean;
  // Upstream nodes feeding this generation. The name is how the model is told
  // one reference from another.
  referenceImages?: ReferenceImage[];
}

export interface GenerateImageV2Result {
  jobId: string;
  status: "done" | "error";
  imageUrl?: string;
  modelUsed?: string;
}

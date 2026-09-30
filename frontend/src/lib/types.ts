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

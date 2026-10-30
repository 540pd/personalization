export type AspectRatioV2 = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

// An upstream node feeding a generation. Discriminated because a text node
// has no payload to point at -- its content IS the reference.
export type Reference =
  | { kind: "image"; url: string; name?: string }
  | { kind: "text"; text: string; name?: string };

/** The generate routes' word on the brand (#452). */
export interface BrandReply {
  used?: string[];
  failed?: boolean;
}

export interface GenerateTextParams {
  modelId: string;
  instruction: string;
  temperature?: number;
  references?: Reference[];
  /** The prompt's @agent (#239): its instructions lead the system instruction. */
  agent?: { name: string; instructions: string };
  /** The prompt's @skills and the agent's own, each once, without front matter (#239). */
  skills?: { name: string; content: string }[];
  /**
   * The brand (#452): the Campaign Brief, which lives in the browser, and
   * the backend adds the rest from the saved Assets page. false: off.
   */
  brand?: { brief: object } | false;
}

export interface GenerateTextResult {
  jobId: string;
  status: string;
  text: string;
  modelUsed: string;
  /** What the brand brought (#452), or that it could not be read; absent when off. */
  brand?: BrandReply;
}

export interface GenerateVideoParams {
  modelId: string;
  instruction: string;
  durationSeconds?: number;
  resolution?: string;
  references?: Reference[];
  /** The prompt's @skills, each once, without front matter (#240). */
  skills?: { name: string; content: string }[];
}

/** Async generation: the POST returns a job, the result arrives by polling. */
export interface JobAccepted {
  jobId: string;
  status: "pending";
}

export interface JobState {
  jobId?: string;
  status: "pending" | "done" | "failed";
  videoUrl?: string;
  modelUsed?: string;
  message?: string;
}

export interface GenerateImageV2Params {
  modelId: string;
  instruction: string;
  aspectRatio: AspectRatioV2;
  quality?: string;
  thinking?: string;
  temperature?: number;
  grounding?: boolean;
  // Upstream nodes feeding this generation. The name is how the model is told
  // one reference from another.
  references?: Reference[];
  /** How many images to generate. Omitted means one, in the original shape. */
  variants?: number;
  /** The prompt's @skills, each once, without front matter (#240). */
  skills?: { name: string; content: string }[];
  /**
   * The brand (#452): the Campaign Brief, which lives in the browser, and
   * the backend adds the rest from the saved Assets page. false: off.
   */
  brand?: { brief: object } | false;
}

/** One variant that failed, by its position in the requested batch. */
export interface VariantError {
  index: number;
  message: string;
}

export interface GenerateImageV2Result {
  jobId: string;
  status: "done" | "error";
  /** Set when one image was asked for. */
  imageUrl?: string;
  /** Set instead of imageUrl when variants > 1. */
  imageUrls?: string[];
  /** Variants that failed in an otherwise successful batch. */
  errors?: VariantError[];
  modelUsed?: string;
  /** What the brand brought (#452), or that it could not be read; absent when off. */
  brand?: BrandReply;
}

import { Router } from "express";
import { requireIdentity } from "../middleware/requireIdentity.js";
import type { AspectRatioV2 } from "../capabilities/types.js";
import { generateImage, generateImageV2 } from "../services/generationService.js";
import { sendValidationError } from "../common/errors.js";
import { isNonEmptyString, isOneOf } from "../common/validation.js";
import { createId } from "../utils/id.js";

export const generateRouter = Router();

// POST /api/generate
// Accepts { prompt, aspectRatio } and enqueues an image generation job.
// TODO: replace with async job queue (Cloud Tasks) for long-running generations.
generateRouter.post("/generate", requireIdentity(), async (req, res, next) => {
  try {
    const { prompt, aspectRatio } = req.body as {
      prompt?: unknown;
      aspectRatio?: unknown;
    };

    if (!isNonEmptyString(prompt)) {
      sendValidationError(res, "prompt is required.");
      return;
    }

    const validAspectRatios = ["1:1", "16:9", "9:16", "4:3"] as const;
    const ratio = isOneOf(aspectRatio, validAspectRatios) ? aspectRatio : "1:1";

    const result = await generateImage({
      prompt: prompt.trim(),
      aspectRatio: ratio,
      userId: req.identity.email,
    });

    res.json({
      jobId: createId(),
      status: "done",
      imageUrl: result.imageUrl,
      modelUsed: result.modelUsed,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/generate/image
// Nano Banana image generation. Accepts { modelId, instruction, aspectRatio,
// quality?, thinking?, temperature?, grounding? }.
const VALID_MODELS = new Set([
  "gemini-3.1-flash-image",
  "gemini-3.1-flash-lite-image",
  "gemini-3-pro-image",
]);
const VALID_ASPECT_RATIOS_V2: AspectRatioV2[] = ["1:1", "16:9", "9:16", "4:3", "3:4"];

generateRouter.post("/generate/image", requireIdentity(), async (req, res, next) => {
  try {
    const { modelId, instruction, aspectRatio, quality, thinking, temperature, grounding, referenceImages } =
      req.body as {
        modelId?: unknown;
        instruction?: unknown;
        aspectRatio?: unknown;
        quality?: unknown;
        thinking?: unknown;
        temperature?: unknown;
        grounding?: unknown;
        referenceImages?: unknown;
      };

    if (!isOneOf(modelId, [...VALID_MODELS])) {
      sendValidationError(res, `modelId must be one of: ${[...VALID_MODELS].join(", ")}.`);
      return;
    }

    if (!isNonEmptyString(instruction)) {
      sendValidationError(res, "instruction is required.");
      return;
    }

    const ratio: AspectRatioV2 = isOneOf(aspectRatio, VALID_ASPECT_RATIOS_V2)
      ? aspectRatio
      : "1:1";

    const result = await generateImageV2({
      modelId,
      instruction: instruction.trim(),
      aspectRatio: ratio,
      userId: req.identity.email,
      quality: quality === "hd" ? "hd" : quality === "standard" ? "standard" : undefined,
      thinking: typeof thinking === "boolean" ? thinking : undefined,
      temperature: typeof temperature === "number" ? temperature : undefined,
      grounding: typeof grounding === "boolean" ? grounding : undefined,
      referenceImages: Array.isArray(referenceImages)
        ? (referenceImages as unknown[]).filter((u): u is string => typeof u === "string")
        : undefined,
    });

    res.json({
      jobId: createId(),
      status: "done",
      imageUrl: result.imageUrl,
      modelUsed: result.modelUsed,
    });
  } catch (err) {
    next(err);
  }
});

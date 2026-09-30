import { Router } from "express";
import { requireIdentity } from "../middleware/requireIdentity.js";
import { getCapability } from "../capabilities/index.js";
import type { AspectRatioV2 } from "../capabilities/types.js";

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

    if (typeof prompt !== "string" || !prompt.trim()) {
      res.status(400).json({ error: "validation_error", message: "prompt is required." });
      return;
    }

    const validAspectRatios = ["1:1", "16:9", "9:16", "4:3"] as const;
    type AspectRatio = (typeof validAspectRatios)[number];
    const ratio: AspectRatio =
      validAspectRatios.includes(aspectRatio as AspectRatio)
        ? (aspectRatio as AspectRatio)
        : "1:1";

    const capability = getCapability();
    const result = await capability.generate({
      prompt: prompt.trim(),
      aspectRatio: ratio,
      userId: req.identity.email,
    });

    res.json({
      jobId: crypto.randomUUID(),
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

    if (typeof modelId !== "string" || !VALID_MODELS.has(modelId)) {
      res.status(400).json({
        error: "validation_error",
        message: `modelId must be one of: ${[...VALID_MODELS].join(", ")}.`,
      });
      return;
    }

    if (typeof instruction !== "string" || !instruction.trim()) {
      res.status(400).json({ error: "validation_error", message: "instruction is required." });
      return;
    }

    const ratio: AspectRatioV2 = VALID_ASPECT_RATIOS_V2.includes(aspectRatio as AspectRatioV2)
      ? (aspectRatio as AspectRatioV2)
      : "1:1";

    const capability = getCapability();
    const result = await capability.generateV2({
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
      jobId: crypto.randomUUID(),
      status: "done",
      imageUrl: result.imageUrl,
      modelUsed: result.modelUsed,
    });
  } catch (err) {
    next(err);
  }
});

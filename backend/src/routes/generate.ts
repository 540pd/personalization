import { Router } from "express";
import { requireIdentity } from "../middleware/requireIdentity.js";
import { getCapability } from "../capabilities/index.js";

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

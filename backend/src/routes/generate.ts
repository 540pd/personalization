import { Router } from "express";
import { requireIdentity } from "../middleware/requireIdentity.js";
import type { AspectRatioV2 } from "../capabilities/types.js";
import { generateImageV2, generateText, generateVideo, generateImageVariants } from "../services/generationService.js";
import { VALID_ASPECT_RATIOS_V2, VALID_MODELS, VALID_TEXT_MODELS, VALID_VIDEO_MODELS } from "../capabilities/models.js";
import { withSkills } from "../capabilities/prompt.js";
import { createJob, completeJob, failJob, getJob } from "../lib/jobStore.js";
import { sendValidationError } from "../common/errors.js";
import { isOneOf } from "../common/validation.js";
import { createId } from "../utils/id.js";
import { readGenerateRequest } from "./generateRequest.js";
import { readReferences } from "./references.js";
import { resolveAssetReferences } from "../services/generatedAssets.js";

export const generateRouter = Router();

// POST /api/generate/image
// Nano Banana image generation. Accepts { modelId, instruction, aspectRatio,
// quality?, thinking?, temperature?, grounding? }.

// Each variant is a separate upstream call, so this cap is a spend control as
// much as a UI one. See generateImageVariants.
const MAX_VARIANTS = 10;

/**
 * `variants` from the body: absent means 1, anything that is not a whole
 * number in range is rejected outright rather than coerced or clamped.
 *
 * Deliberately strict about the type. Clamping a stray 100 to 10 would bill
 * for ten images the caller never asked for, and accepting "4" would let a
 * client that forgot to parse its own form field spend real money by
 * accident.
 */
function readVariants(raw: unknown): number | null {
  if (raw === undefined || raw === null) return 1;
  if (typeof raw !== "number" || !Number.isInteger(raw)) return null;
  if (raw < 1 || raw > MAX_VARIANTS) return null;
  return raw;
}

generateRouter.post("/generate/image", requireIdentity(), async (req, res, next) => {
  try {
    const { aspectRatio, quality, thinking, temperature, grounding, referenceImages, variants } =
      req.body as {
        aspectRatio?: unknown;
        quality?: unknown;
        thinking?: unknown;
        temperature?: unknown;
        grounding?: unknown;
        referenceImages?: unknown;
        variants?: unknown;
      };

    // The prompt's @skills (#240). An agent is a Prompt-panel setup: not taken here.
    const request = readGenerateRequest(req.body, { models: VALID_MODELS, agent: false });
    if (!request.ok) {
      sendValidationError(res, request.message);
      return;
    }

    // Checked before anything is dispatched: a bad count must not bill for a
    // single image, let alone eleven.
    const variantCount = readVariants(variants);
    if (variantCount === null) {
      sendValidationError(res, `variants must be a whole number from 1 to ${MAX_VARIANTS}.`);
      return;
    }

    const ratio: AspectRatioV2 = isOneOf(aspectRatio, VALID_ASPECT_RATIOS_V2)
      ? aspectRatio
      : "1:1";

    const generationParams = {
      modelId: request.modelId,
      instruction: withSkills(request.instruction, request.context.skills),
      aspectRatio: ratio,
      userId: req.identity.email,
      // Passed through rather than squashed: imageSize takes "1K" | "2K" |
      // "4K" directly, and the Thinking label maps to a ThinkingLevel in the
      // capability. The old "standard" | "hd" pair was read by nothing.
      imageSize: isOneOf(quality, ["1K", "2K", "4K"]) ? quality : undefined,
      thinking: isOneOf(thinking, ["None", "Minimal", "Full"]) ? thinking : undefined,
      temperature: typeof temperature === "number" ? temperature : undefined,
      grounding: typeof grounding === "boolean" ? grounding : undefined,
      // referenceImages is this route's older name for references.
      references: referenceImages === undefined || referenceImages === null
        ? request.references
        : readReferences(referenceImages),
    };

    // Stored references (#323) read back into bytes before anything is billed.
    const references = await resolveAssetReferences(generationParams.references, req.identity.email);
    if (!references.ok) {
      sendValidationError(res, references.message);
      return;
    }
    generationParams.references = references.references;

    // One variant keeps the original response shape, so a client that has not
    // been redeployed sees no change at all.
    if (variantCount === 1) {
      const result = await generateImageV2(generationParams);
      res.json({
        jobId: createId(),
        status: "done",
        imageUrl: result.imageUrl,
        modelUsed: result.modelUsed,
      });
      return;
    }

    const { images, errors } = await generateImageVariants(generationParams, variantCount);

    // Only a batch where nothing came back is a failure. Losing one variant of
    // four should still hand over the three that worked.
    if (!images.length) {
      next(new Error(errors[0]?.message ?? "Every variant failed to generate."));
      return;
    }

    res.json({
      jobId: createId(),
      status: "done",
      imageUrls: images.map((image) => image.imageUrl),
      modelUsed: images[0].modelUsed,
      ...(errors.length ? { errors } : {}),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/generate/text
// Backs the node > instruction canvas node. Same shape as /generate/image --
// a model allowlist, a required instruction, and optional named references --
// so the two differ only in their models and their options.

generateRouter.post("/generate/text", requireIdentity(), async (req, res, next) => {
  try {
    const { temperature } = req.body as { temperature?: unknown };

    // The prompt's @agent and @skills (#239).
    const request = readGenerateRequest(req.body, { models: VALID_TEXT_MODELS, agent: true });
    if (!request.ok) {
      sendValidationError(res, request.message);
      return;
    }

    const references = await resolveAssetReferences(request.references, req.identity.email);
    if (!references.ok) {
      sendValidationError(res, references.message);
      return;
    }

    const result = await generateText({
      modelId: request.modelId,
      instruction: request.instruction,
      userId: req.identity.email,
      temperature: typeof temperature === "number" ? temperature : undefined,
      references: references.references,
      agent: request.context.agent,
      skills: request.context.skills,
    });

    res.json({
      jobId: createId(),
      status: "done",
      text: result.text,
      modelUsed: result.modelUsed,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/generate/video
// Asynchronous, unlike the image and text routes: video generation runs for
// minutes and a Cloud Run request would time out. Returns a jobId
// immediately; the client polls GET /api/generate/job/:jobId.
//
// This is the contract #203 should preserve when it swaps the in-memory job
// store for Cloud Tasks -- the HTTP surface is the part the client is built
// against and should not have to change.

generateRouter.post("/generate/video", requireIdentity(), async (req, res, next) => {
  const { durationSeconds, resolution } = req.body as {
    durationSeconds?: unknown;
    resolution?: unknown;
  };

  // The prompt's @skills (#240), checked before a job exists.
  const request = readGenerateRequest(req.body, { models: VALID_VIDEO_MODELS, agent: false });
  if (!request.ok) {
    sendValidationError(res, request.message);
    return;
  }

  let references;
  try {
    references = await resolveAssetReferences(request.references, req.identity.email);
  } catch (err) {
    next(err);
    return;
  }
  if (!references.ok) {
    sendValidationError(res, references.message);
    return;
  }

  const job = createJob(req.identity.email);

  // Deliberately not awaited: the response goes out now and the work settles
  // the job later. Errors land on the job, never as an unhandled rejection.
  void generateVideo({
    modelId: request.modelId,
    instruction: withSkills(request.instruction, request.context.skills),
    userId: req.identity.email,
    durationSeconds: typeof durationSeconds === "number" ? durationSeconds : undefined,
    resolution: typeof resolution === "string" ? resolution : undefined,
    references: references.references,
  })
    .then((result) => completeJob(job.id, result))
    .catch((err: unknown) => {
      failJob(job.id, err instanceof Error ? err.message : "Video generation failed.");
    });

  res.status(202).json({ jobId: job.id, status: "pending" });
});

// GET /api/generate/job/:jobId
// Poll target for any asynchronous generation.
generateRouter.get("/generate/job/:jobId", requireIdentity(), (req, res) => {
  const { jobId } = req.params;
  if (typeof jobId !== "string") {
    sendValidationError(res, "jobId must be a single value.");
    return;
  }
  const job = getJob(jobId, req.identity.email);

  if (!job) {
    // Also the answer after a backend restart, which drops in-memory jobs.
    // Explicit failure rather than a client left polling forever.
    res.status(404).json({
      status: "failed",
      message: "Job not found. It may have expired or the server restarted.",
    });
    return;
  }

  res.json({
    jobId: job.id,
    status: job.status,
    ...(job.result ? { videoUrl: job.result.videoUrl, modelUsed: job.result.modelUsed } : {}),
    ...(job.error ? { message: job.error } : {}),
  });
});

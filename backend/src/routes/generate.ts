import { Router } from "express";
import { requireIdentity } from "../middleware/requireIdentity.js";
import type { AspectRatioV2 } from "../capabilities/types.js";
import { generateImageV2, generateText, generateImageVariants } from "../services/generationService.js";
import { VALID_ASPECT_RATIOS_V2, VALID_MODELS, VALID_TEXT_MODELS, VALID_VIDEO_MODELS } from "../capabilities/models.js";
import { withSkills } from "../capabilities/prompt.js";
import { readJob, startVideoJob } from "../services/videoJobs.js";
import { sendValidationError } from "../common/errors.js";
import { isOneOf } from "../common/validation.js";
import { createId } from "../utils/id.js";
import { readGenerateRequest } from "./generateRequest.js";
import { readReferences } from "./references.js";
import { resolveAssetReferences } from "../services/generatedAssets.js";
import { buildBrandContext, readBrandRequest, withBrand, type BrandContext } from "../services/brandContext.js";

export const generateRouter = Router();

/**
 * The brand for a request (#452): null when off; never an error once the
 * body is valid, since a brand that cannot be read is generated without.
 */
async function brandFor(raw: unknown, userId: string): Promise<{ ok: true; brand: BrandContext | null } | { ok: false; message: string }> {
  const request = readBrandRequest(raw);
  if (!request.ok) return request;
  return { ok: true, brand: request.brief ? await buildBrandContext(userId, request.brief) : null };
}

/** What the response says of the brand: what it used, or that it could not be read. */
const brandReply = (brand: BrandContext | null) =>
  !brand ? {} : brand.failed ? { brand: { failed: true } } : { brand: { used: brand.used } };

// POST /api/generate/image
// Nano Banana image generation. Accepts { modelId, instruction, aspectRatio,
// quality?, thinking?, temperature?, grounding? }.

// One job is one Firestore document (1 MiB).
const MAX_JOB_BYTES = 900 * 1024;

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

    const branded = await brandFor((req.body as { brand?: unknown }).brand, req.identity.email);
    if (!branded.ok) {
      sendValidationError(res, branded.message);
      return;
    }
    const brand = branded.brand && !branded.brand.failed ? branded.brand : null;
    const upstream = referenceImages === undefined || referenceImages === null
      ? request.references
      : readReferences(referenceImages);

    const generationParams = {
      modelId: request.modelId,
      // The brand ahead of the skills and the prompt (#452).
      instruction: withBrand(withSkills(request.instruction, request.context.skills), brand?.block),
      aspectRatio: ratio,
      userId: req.identity.email,
      // Passed through rather than squashed: imageSize takes "1K" | "2K" |
      // "4K" directly, and the Thinking label maps to a ThinkingLevel in the
      // capability. The old "standard" | "hd" pair was read by nothing.
      imageSize: isOneOf(quality, ["1K", "2K", "4K"]) ? quality : undefined,
      thinking: isOneOf(thinking, ["None", "Minimal", "Full"]) ? thinking : undefined,
      temperature: typeof temperature === "number" ? temperature : undefined,
      grounding: typeof grounding === "boolean" ? grounding : undefined,
      // referenceImages is this route's older name for references. The
      // brand's images come first, each named (#452).
      references: brand?.references.length ? [...brand.references, ...(upstream ?? [])] : upstream,
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
        ...brandReply(branded.brand),
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
      ...brandReply(branded.brand),
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

    const branded = await brandFor((req.body as { brand?: unknown }).brand, req.identity.email);
    if (!branded.ok) {
      sendValidationError(res, branded.message);
      return;
    }
    const brand = branded.brand && !branded.brand.failed ? branded.brand : null;

    // The brand's images first, each named (#452), then the prompt's own.
    const withBrandRefs = brand?.references.length ? [...brand.references, ...(request.references ?? [])] : request.references;
    const references = await resolveAssetReferences(withBrandRefs, req.identity.email);
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
      brand: brand?.block,
      brandUsed: brand?.used,
    });

    res.json({
      jobId: createId(),
      status: "done",
      text: result.text,
      modelUsed: result.modelUsed,
      ...brandReply(branded.brand),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/generate/video
// Asynchronous, unlike the image and text routes: video generation runs for
// minutes and a Cloud Run request would time out. Queues a job (#325) and
// returns its id at once; the client polls GET /api/generate/job/:jobId.
// That contract is unchanged since the first in-memory jobs.

generateRouter.post("/generate/video", requireIdentity(), async (req, res, next) => {
  try {
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

    // Stored references checked now, so a missing one fails the request,
    // not the job minutes later; they are read into bytes when it runs.
    const references = await resolveAssetReferences(request.references, req.identity.email);
    if (!references.ok) {
      sendValidationError(res, references.message);
      return;
    }

    const params = {
      modelId: request.modelId,
      instruction: withSkills(request.instruction, request.context.skills),
      durationSeconds: typeof durationSeconds === "number" ? durationSeconds : undefined,
      resolution: typeof resolution === "string" ? resolution : undefined,
      references: request.references,
    };
    // A job is one Firestore document: inline (data:) references past this
    // belong in stored assets.
    if (Buffer.byteLength(JSON.stringify(params)) > MAX_JOB_BYTES) {
      res.status(413).json({ error: "too_large", message: "The references are too large to queue. Use stored images." });
      return;
    }

    // Answers at once; the dispatcher runs the job and the client polls.
    const job = await startVideoJob(req.identity.email, params);
    res.status(202).json({ jobId: job.id, status: "pending" });
  } catch (err) {
    next(err);
  }
});

// GET /api/generate/job/:jobId
// Poll target for any asynchronous generation.
generateRouter.get("/generate/job/:jobId", requireIdentity(), async (req, res, next) => {
  try {
    const { jobId } = req.params;
    if (typeof jobId !== "string") {
      sendValidationError(res, "jobId must be a single value.");
      return;
    }
    const job = await readJob(jobId, req.identity.email);

    if (!job) {
      // Another user's, or one that never was (or, in memory, a restart).
      // Explicit failure rather than a client left polling forever.
      res.status(404).json({
        status: "failed",
        message: "Job not found. It may have expired or the server restarted.",
      });
      return;
    }

    // queued and running are both "pending" to the client (#325).
    const status = job.status === "done" || job.status === "failed" ? job.status : "pending";
    res.json({
      jobId: job.id,
      status,
      ...(job.result ? { videoUrl: job.result.videoUrl, modelUsed: job.result.modelUsed } : {}),
      ...(job.error ? { message: job.error } : {}),
    });
  } catch (err) {
    next(err);
  }
});

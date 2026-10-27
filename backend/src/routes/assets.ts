import express, { Router, type ErrorRequestHandler } from "express";
import { requireIdentity } from "../middleware/requireIdentity.js";
import { deleteAsset, listAssets, openAsset, saveAsset } from "../services/assetService.js";
import { sendValidationError } from "../common/errors.js";
import { ASSET_MIME_TYPES, MAX_ASSET_BYTES, isAssetMimeType } from "../lib/assets/index.js";

export const assetsRouter = Router();

// The file itself as the body, typed by Content-Type: no multipart, so the
// proxy forwards it byte for byte and nothing parses a form.
const rawBody = express.raw({ type: () => true, limit: MAX_ASSET_BYTES });

// POST /api/assets — stores an upload; 201 with its id and URL.
assetsRouter.post("/assets", requireIdentity(), rawBody, async (req, res, next) => {
  try {
    const mimeType = (req.header("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
    if (!isAssetMimeType(mimeType)) {
      res.status(415).json({
        error: "unsupported_type",
        message: `Only ${ASSET_MIME_TYPES.join(", ")} can be stored.`,
      });
      return;
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      sendValidationError(res, "The file is empty.");
      return;
    }
    res.status(201).json(await saveAsset(req.identity.email, req.body, mimeType, "upload"));
  } catch (err) {
    next(err);
  }
});

// GET /api/assets — the user's assets, newest first.
assetsRouter.get("/assets", requireIdentity(), async (req, res, next) => {
  try {
    res.json(await listAssets(req.identity.email));
  } catch (err) {
    next(err);
  }
});

// GET /api/assets/:id/content — the bytes. An asset never changes once
// stored, so the browser may keep it for good. Another user's id is a 404,
// like a missing one: whether it exists is not theirs to learn.
assetsRouter.get("/assets/:id/content", requireIdentity(), async (req, res, next) => {
  try {
    const found = await openAsset(req.params.id as string, req.identity.email);
    if (!found) {
      res.status(404).json({ error: "not_found", message: "Asset not found." });
      return;
    }
    const { asset, stream } = found;
    res.set({
      "Content-Type": asset.mimeType,
      "Content-Length": String(asset.bytes),
      "Cache-Control": "private, max-age=31536000, immutable",
      ETag: `"${asset.id}"`,
      "X-Content-Type-Options": "nosniff",
    });
    stream.on("error", (err) => {
      // Headers are out: all that is left is to cut the response short.
      if (res.headersSent) res.destroy(err);
      else next(err);
    });
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/assets/:id — 204 whether or not it was there.
assetsRouter.delete("/assets/:id", requireIdentity(), async (req, res, next) => {
  try {
    await deleteAsset(req.params.id as string, req.identity.email);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// An upload over the limit is the client's mistake, not a 500.
const tooLarge: ErrorRequestHandler = (err, _req, res, next) => {
  if ((err as { type?: string }).type !== "entity.too.large") return next(err);
  res.status(413).json({ error: "too_large", message: `Files can be up to ${MAX_ASSET_BYTES / 1024 / 1024} MB.` });
};
assetsRouter.use(tooLarge);

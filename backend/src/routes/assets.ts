import express, { Router, type ErrorRequestHandler } from "express";
import { requireIdentity } from "../middleware/requireIdentity.js";
import { deleteAsset, getAsset, listAssets, openAsset, saveUpload, updateAsset } from "../services/assetService.js";
import { sendValidationError } from "../common/errors.js";
import { describeAsset } from "../services/describeService.js";
import {
  ASSET_KINDS,
  ASSET_MIME_TYPES,
  GUIDELINES_MIME,
  MAX_ASSET_BYTES,
  MAX_GUIDELINES_BYTES,
  isUtf8,
  MAX_DESCRIPTION,
  cleanFileName,
  detailsError,
  isAssetKind,
  isAssetMimeType,
  type AssetDetails,
  type AssetInfo,
  type AssetKind,
} from "../lib/assets/index.js";

export const assetsRouter = Router();

// The file itself as the body, typed by Content-Type: no multipart, so the
// proxy forwards it byte for byte and nothing parses a form.
const rawBody = express.raw({ type: () => true, limit: MAX_ASSET_BYTES });

const KIND_LIST = ASSET_KINDS.join(", ");

/**
 * Brand guidelines are Markdown, and Markdown is only ever brand guidelines
 * (#450): a text file is no image for any other kind, and an unnamed one
 * would sit among the board's uploads as nothing at all.
 */
function refuseMarkdownMismatch(res: express.Response, kind: AssetKind | null | undefined, mimeType: string): boolean {
  if ((kind === "guidelines") === (mimeType === GUIDELINES_MIME)) return false;
  res.status(415).json({
    error: "unsupported_type",
    message: kind === "guidelines" ? "Brand guidelines must be Markdown (.md) files." : "Markdown files are stored as brand guidelines only.",
  });
  return true;
}

/** A logo is placed on creatives, so it needs transparency: PNG only (#412). */
function refuseNonPngLogo(res: express.Response, kind: AssetKind | null | undefined, mimeType: string): boolean {
  if (kind !== "logo" || mimeType === "image/png") return false;
  res.status(415).json({ error: "unsupported_type", message: "The logo must be a PNG." });
  return true;
}

// POST /api/assets — stores an upload; 201 with its id and URL, and whether
// it is durable (in memory it is not: the board should keep its own copy).
// The Assets page (#412) says what it is in the query, ?kind=…&name=…, as the
// body is the file itself and the proxy forwards no custom headers.
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
    const { kind, name } = req.query;
    if (kind !== undefined && !isAssetKind(kind)) {
      sendValidationError(res, `kind must be one of: ${KIND_LIST}.`);
      return;
    }
    if (refuseNonPngLogo(res, kind, mimeType)) return;
    if (refuseMarkdownMismatch(res, kind, mimeType)) return;
    if (kind === "guidelines") {
      if (req.body.length > MAX_GUIDELINES_BYTES) {
        res.status(413).json({ error: "too_large", message: `Brand guidelines can be up to ${MAX_GUIDELINES_BYTES / 1024} KB.` });
        return;
      }
      if (!isUtf8(req.body)) {
        res.status(415).json({ error: "unsupported_type", message: "This file isn't plain text." });
        return;
      }
    }
    const info: AssetInfo = {};
    if (kind) info.kind = kind;
    const fileName = cleanFileName(name);
    if (fileName) info.name = fileName;
    res.status(201).json(await saveUpload(req.identity.email, req.body, mimeType, info));
  } catch (err) {
    next(err);
  }
});

// GET /api/assets — the user's assets, newest first; ?kind=… for one kind.
assetsRouter.get("/assets", requireIdentity(), async (req, res, next) => {
  try {
    const { kind } = req.query;
    if (kind !== undefined && !isAssetKind(kind)) {
      sendValidationError(res, `kind must be one of: ${KIND_LIST}.`);
      return;
    }
    res.json(await listAssets(req.identity.email, kind));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/assets/:id — changes what the asset is: { kind?, description?,
// details? }, each optional. A new kind starts with no details unless they
// come with it, since the old kind's fields would not fit.
assetsRouter.patch("/assets/:id", requireIdentity(), async (req, res, next) => {
  try {
    const body = req.body as unknown;
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      sendValidationError(res, "Send a JSON object.");
      return;
    }
    const { kind, description, details } = body as Record<string, unknown>;
    if (kind !== undefined && kind !== null && !isAssetKind(kind)) {
      sendValidationError(res, `kind must be one of: ${KIND_LIST}, or null.`);
      return;
    }
    if (description !== undefined && (typeof description !== "string" || description.length > MAX_DESCRIPTION)) {
      sendValidationError(res, `description must be text, up to ${MAX_DESCRIPTION} characters.`);
      return;
    }

    const asset = await getAsset(req.params.id as string, req.identity.email);
    if (!asset) {
      res.status(404).json({ error: "not_found", message: "Asset not found." });
      return;
    }
    const nextKind = kind === undefined ? (asset.kind ?? null) : (kind as AssetKind | null);
    const kindChanged = nextKind !== (asset.kind ?? null);
    if (details !== undefined) {
      const problem = detailsError(nextKind, details);
      if (problem) {
        sendValidationError(res, problem);
        return;
      }
    }
    if (refuseNonPngLogo(res, nextKind, asset.mimeType)) return;
    if (refuseMarkdownMismatch(res, nextKind, asset.mimeType)) return;

    const info: AssetInfo = {};
    if (kind !== undefined) info.kind = nextKind;
    if (description !== undefined) info.description = description as string;
    if (details !== undefined) info.details = details as AssetDetails;
    else if (kindChanged) info.details = {};
    res.json(await updateAsset(asset.id, req.identity.email, info));
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
      // Markdown is text: say how to read it, or a browser may guess wrong.
      "Content-Type": asset.mimeType.startsWith("text/") ? `${asset.mimeType}; charset=utf-8` : asset.mimeType,
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

// POST /api/assets/:id/describe — one line about the image, written by the
// text model (#448): { description }. Not saved: the Assets page puts it in
// its draft, kept with Save like a typed one. 415 for a video.
assetsRouter.post("/assets/:id/describe", requireIdentity(), async (req, res, next) => {
  try {
    const result = await describeAsset(req.params.id as string, req.identity.email);
    if ("description" in result) {
      res.json(result);
      return;
    }
    if (result.error === "not_found") {
      res.status(404).json({ error: "not_found", message: "Asset not found." });
      return;
    }
    res.status(415).json({ error: "unsupported_type", message: "Only images can be described." });
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

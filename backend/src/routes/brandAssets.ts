import { Router } from "express";
import { requireIdentity } from "../middleware/requireIdentity.js";
import { sendValidationError } from "../common/errors.js";
import { deletePendingUploads, getBrandAssets, readBrandAssets, saveBrandAssets } from "../services/brandAssetsService.js";

export const brandAssetsRouter = Router();

// GET /api/brand-assets — the saved Assets page (#413): { revision,
// updatedAt, record, assets }, revision 0 and an empty record until saved.
brandAssetsRouter.get("/brand-assets", requireIdentity(), async (req, res, next) => {
  try {
    res.json(await getBrandAssets(req.identity.email));
  } catch (err) {
    next(err);
  }
});

// PUT /api/brand-assets — { revision, productName, sku, masterId, colours,
// assetIds }: saves the page if `revision` is still the latest; 409 with the
// latest if another save landed first (a second tab).
brandAssetsRouter.put("/brand-assets", requireIdentity(), async (req, res, next) => {
  try {
    const body = req.body as unknown;
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      sendValidationError(res, "Send a JSON object.");
      return;
    }
    const { revision } = body as { revision?: unknown };
    if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) {
      sendValidationError(res, "revision must be a whole number, 0 or more.");
      return;
    }
    const record = readBrandAssets(body as Record<string, unknown>);
    if (typeof record === "string") {
      sendValidationError(res, record);
      return;
    }
    const result = await saveBrandAssets(req.identity.email, record, revision);
    if (result.ok) res.json({ revision: result.revision, updatedAt: result.updatedAt });
    else if ("conflict" in result) {
      res.status(409).json({ error: "conflict", message: "The Assets page was saved elsewhere since.", revision: result.revision });
    } else sendValidationError(res, result.invalid);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/brand-assets/pending — removes the page's uploads that were
// never saved (Cancel, a discarded leave): { deleted }.
brandAssetsRouter.delete("/brand-assets/pending", requireIdentity(), async (req, res, next) => {
  try {
    res.json({ deleted: await deletePendingUploads(req.identity.email) });
  } catch (err) {
    next(err);
  }
});

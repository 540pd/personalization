import { Router } from "express";
import { requireIdentity } from "../middleware/requireIdentity.js";
import { sendValidationError } from "../common/errors.js";
import { getBrand, readBrand, saveBrand } from "../services/brandService.js";

export const brandRouter = Router();

// GET /api/brand — the saved Brand page (#454): { revision, updatedAt,
// brand }, revision 0 and an empty brand until saved.
brandRouter.get("/brand", requireIdentity(), async (req, res, next) => {
  try {
    res.json(await getBrand(req.identity.email));
  } catch (err) {
    next(err);
  }
});

// PUT /api/brand — { revision, brand }: saves it if `revision` is still the
// latest; 409 with the latest if another save landed first (a second tab).
brandRouter.put("/brand", requireIdentity(), async (req, res, next) => {
  try {
    const body = req.body as unknown;
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      sendValidationError(res, "Send a JSON object.");
      return;
    }
    const { revision, brand } = body as { revision?: unknown; brand?: unknown };
    if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) {
      sendValidationError(res, "revision must be a whole number, 0 or more.");
      return;
    }
    const record = readBrand(brand);
    if (typeof record === "string") {
      sendValidationError(res, record);
      return;
    }
    const result = await saveBrand(req.identity.email, record, revision);
    if (result.ok) res.json({ revision: result.revision, updatedAt: result.updatedAt });
    else res.status(409).json({ error: "conflict", message: "The brand was saved elsewhere since.", revision: result.revision });
  } catch (err) {
    next(err);
  }
});

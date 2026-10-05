import { Router } from "express";
import { requireIdentity } from "../middleware/requireIdentity.js";
import { deleteAsset, listAssets } from "../services/assetService.js";

export const assetsRouter = Router();

// GET /api/assets
// TODO: list assets from GCS/Firestore for the authenticated user's board.
assetsRouter.get("/assets", requireIdentity(), (req, res) => {
  res.json(listAssets(req.identity.email));
});

// DELETE /api/assets/:id
// TODO: remove asset from GCS and Firestore.
assetsRouter.delete("/assets/:id", requireIdentity(), (req, res) => {
  deleteAsset(req.params.id as string, req.identity.email);
  res.status(204).end();
});

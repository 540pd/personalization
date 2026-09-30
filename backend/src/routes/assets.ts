import { Router } from "express";
import { requireIdentity } from "../middleware/requireIdentity.js";

export const assetsRouter = Router();

// GET /api/assets
// TODO: list assets from GCS/Firestore for the authenticated user's board.
assetsRouter.get("/assets", requireIdentity(), (req, res) => {
  void req;
  res.json([]);
});

// DELETE /api/assets/:id
// TODO: remove asset from GCS and Firestore.
assetsRouter.delete("/assets/:id", requireIdentity(), (req, res) => {
  void req;
  res.status(204).end();
});

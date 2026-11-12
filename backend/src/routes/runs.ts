import { Router } from "express";
import { requireIdentity } from "../middleware/requireIdentity.js";
import { IDEMPOTENCY_HEADER, runs } from "../lib/runs/index.js";

// POST /api/runs — admit one Run click (#491 PACK NJS-05, #492 PACK NJS-06):
// the pack's Run request (02_SHARED_CONTRACTS.md §2) with an Idempotency-Key
// header. Verified (#493), reserved with the Playspace lock in one transaction,
// then handed to FastAPI (#494). The answer is the job ID only:
//   202 { jobId, status: "accepted" | "pending" }   new, or a replay still pending
//   200 { jobId, status: "accepted" }                a replay of an accepted Run
//   409 idempotency_conflict | playspace_busy | run_failed
// Nothing calls it from the canvas yet; today's /generate routes are unchanged.
export const runsRouter = Router();

runsRouter.post("/runs", requireIdentity(), async (req, res, next) => {
  try {
    const result = await runs().admitRun(
      { email: req.identity.email, ...(req.identity.ownerKey ? { ownerKey: req.identity.ownerKey } : {}) },
      req.header(IDEMPOTENCY_HEADER),
      req.body
    );
    res.setHeader("Cache-Control", "no-store");
    if (!result.ok) {
      res.status(result.status).json({ error: result.code, message: result.message, ...(result.field ? { field: result.field } : {}) });
      return;
    }
    res.status(result.status).json({ jobId: result.jobId, status: result.state });
  } catch (err) {
    next(err);
  }
});

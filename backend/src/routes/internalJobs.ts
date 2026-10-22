import { Router, type Request } from "express";
import { OAuth2Client } from "google-auth-library";
import type { CloudTasksConfig } from "../lib/jobs/cloudTasks.js";
import { runJob } from "../services/videoJobs.js";

const oauth = new OAuth2Client();

/** The Cloud Tasks identity on the request, or why it is not one. */
async function taskCaller(req: Request, config: CloudTasksConfig): Promise<{ ok: true } | { ok: false; status: 401 | 403 }> {
  const header = req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return { ok: false, status: 401 };
  try {
    const ticket = await oauth.verifyIdToken({ idToken: token, audience: config.workerUrl });
    const payload = ticket.getPayload();
    return payload?.email === config.serviceAccount && payload.email_verified ? { ok: true } : { ok: false, status: 403 };
  } catch {
    return { ok: false, status: 401 };
  }
}

/**
 * POST /internal/jobs/:id/run -- what a Cloud Task calls (#325). Outside
 * /api, so /api/proxy can never reach it, and only for a Google-signed
 * token minted for the configured service account and this URL.
 *
 * Answers when the job is settled: a 2xx tells the queue it is done, so the
 * request lives as long as the video does (Cloud Run's timeout must allow
 * it). runJob never throws and is a no-op for a job already claimed, so a
 * task the queue retries runs nothing twice.
 */
export function internalJobsRouter(config: CloudTasksConfig): Router {
  const router = Router();
  router.post("/internal/jobs/:id/run", async (req, res, next) => {
    try {
      const caller = await taskCaller(req, config);
      if (!caller.ok) {
        res.status(caller.status).json({ error: caller.status === 401 ? "unauthenticated" : "forbidden" });
        return;
      }
      await runJob(req.params.id as string);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });
  return router;
}

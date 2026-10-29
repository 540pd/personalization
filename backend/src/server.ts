import "dotenv/config";
import { pathToFileURL } from "url";
import express from "express";
import cors from "cors";
import { requestLogger } from "./middleware/requestLogger.js";
import { authConfigRouter } from "./routes/authConfig.js";
import { sessionRouter } from "./routes/session.js";
import { boardsRouter } from "./routes/boards.js";
import { generateRouter } from "./routes/generate.js";
import { assetsRouter } from "./routes/assets.js";
import { brandAssetsRouter } from "./routes/brandAssets.js";
import { isFirestoreMode, getFirestoreClient } from "./lib/firestore.js";
import { isGcsMode, getBucket } from "./lib/gcs.js";
import { assertDeployable, describeServiceModes, serviceModes } from "./lib/serviceModes.js";
import { resumeUnfinishedJobs } from "./services/videoJobs.js";
import { cloudTasksConfig } from "./lib/jobs/cloudTasks.js";
import { internalJobsRouter } from "./routes/internalJobs.js";
import { globalErrorHandler } from "./common/errors.js";

const PORT = process.env.PORT ?? 4000;

const isProduction = !!process.env.K_SERVICE || process.env.NODE_ENV === "production";
const DEV_DEFAULTS = ["http://localhost:3000"];

function buildAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS?.trim();
  if (raw) return raw.split(",").map((o) => o.trim()).filter(Boolean);
  if (!isProduction) {
    console.warn("CORS: ALLOWED_ORIGINS not set — falling back to dev defaults:", DEV_DEFAULTS.join(", "));
    return DEV_DEFAULTS;
  }
  console.warn("CORS: ALLOWED_ORIGINS not set — all cross-origin requests will be blocked");
  return [];
}

const allowedOrigins = buildAllowedOrigins();
if (allowedOrigins.length > 0) {
  console.log("CORS: allowed origins →", allowedOrigins.join(", "));
}

function corsOriginHandler(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean | string) => void
): void {
  if (!origin) {
    callback(null, !isProduction);
    return;
  }
  if (allowedOrigins.includes(origin)) {
    callback(null, origin);
  } else {
    callback(null, false);
  }
}

/**
 * Builds the fully-wired Express app without binding a port.
 *
 * Extracted so tests can drive the app over real HTTP via supertest without
 * binding a port on import — returns a NEW app on every call so one test's
 * state never leaks into another's.
 */
export function createApp(): express.Express {
  const app = express();

  app.use(cors({ origin: corsOriginHandler, credentials: true }));
  app.use(express.json({ limit: "10mb" }));
  app.use(requestLogger);

  // Deep health check — probes real connectivity to storage backends.
  // No auth required: called by Cloud Run health checks from infra.
  // Returns 200 when probes pass, 503 when any probe fails.
  app.get("/api/health", (_req, res) => {
    const PROBE_TIMEOUT_MS = 3_000;
    const HANDLER_TIMEOUT_MS = 5_000;

    function rejectAfter(ms: number, label: string): Promise<never> {
      return new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${label} probe timed out after ${ms}ms`)), ms)
      );
    }

    async function runProbes() {
      // Both, when both are configured: Storage used to go unchecked
      // whenever Firestore was set.
      const probes: Array<[string, () => Promise<unknown>]> = [];
      if (isFirestoreMode()) probes.push(["Firestore", () => getFirestoreClient().collection("health").limit(1).get()]);
      // Listing one object, not reading the bucket's metadata: that needs
      // storage.buckets.get, which the backend's storage.objectAdmin role on
      // its bucket does not grant (nor does the Storage emulator serve it).
      if (isGcsMode()) probes.push(["GCS", () => getBucket().getFiles({ maxResults: 1, autoPaginate: false })]);

      const failures = (
        await Promise.all(
          probes.map(([label, probe]) =>
            Promise.race([probe(), rejectAfter(PROBE_TIMEOUT_MS, label)]).then(
              () => null,
              (err: unknown) => `${label}: ${(err as Error).message}`
            )
          )
        )
      ).filter((f): f is string => f !== null);
      const storageOk = failures.length === 0;
      const storageError = storageOk ? undefined : failures.join("; ");

      return { storageOk, storageError };
    }

    Promise.race([runProbes(), rejectAfter(HANDLER_TIMEOUT_MS, "health handler")])
      .then(({ storageOk, storageError }) => {
        const status = storageOk ? 200 : 503;
        res.status(status).json({
          ok: storageOk,
          storage: storageOk ? "ok" : storageError,
          // Which services are real and which are placeholders (#333).
          modes: serviceModes(),
          uptime: process.uptime(),
        });
      })
      .catch((err: unknown) => {
        res.status(503).json({ ok: false, error: (err as Error).message });
      });
  });

  app.use("/api", authConfigRouter);
  app.use("/api", sessionRouter);
  app.use("/api", boardsRouter);
  app.use("/api", generateRouter);
  app.use("/api", assetsRouter);
  app.use("/api", brandAssetsRouter);

  // Cloud Tasks' worker endpoint (#325), outside /api and only when the
  // queue is set up: in process, nothing calls in.
  const tasks = cloudTasksConfig();
  if (tasks) app.use(internalJobsRouter(tasks));

  app.use(globalErrorHandler);

  return app;
}

const isEntryPoint =
  !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  process.on("unhandledRejection", (reason) => {
    console.error("[unhandledRejection]", reason);
  });

  process.on("uncaughtException", (err) => {
    console.error("[uncaughtException]", err);
    process.exit(1);
  });

  // Before binding: a deployed backend on a storage placeholder must not
  // take traffic it would lose (#333).
  assertDeployable();

  const server = createApp().listen(PORT, () => {
    console.log(`GCOS backend listening on http://localhost:${PORT}\n${describeServiceModes()}`);
    // Video jobs a restart interrupted run again (#325).
    resumeUnfinishedJobs()
      .then((n) => n && console.log(`[jobs] Picked up ${n} unfinished video job(s).`))
      .catch((err) => console.error("[jobs] Could not pick up unfinished jobs", err));
  });

  const gracefulShutdown = (signal: string) => {
    console.log(`[${signal}] Graceful shutdown — draining in-flight requests…`);
    server.close((err) => {
      if (err) {
        console.error("[shutdown] Error closing server:", err);
        process.exit(1);
      }
      console.log("[shutdown] All connections closed — exiting.");
      process.exit(0);
    });
    // Force-exit after 9s so a stuck request doesn't hold up a Cloud Run deployment.
    setTimeout(() => {
      console.error("[shutdown] Drain timeout reached — forcing exit.");
      process.exit(1);
    }, 9_000).unref();
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

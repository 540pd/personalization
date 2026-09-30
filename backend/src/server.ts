import "dotenv/config";
import { pathToFileURL } from "url";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import { requestLogger } from "./middleware/requestLogger.js";
import { authConfigRouter } from "./routes/authConfig.js";
import { sessionRouter } from "./routes/session.js";
import { boardsRouter } from "./routes/boards.js";
import { generateRouter } from "./routes/generate.js";
import { assetsRouter } from "./routes/assets.js";
import { isFirestoreMode, getFirestoreClient } from "./lib/firestore.js";
import { isGcsMode, getBucket } from "./lib/gcs.js";

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
      let storageOk = true;
      let storageError: string | undefined;

      if (isFirestoreMode()) {
        try {
          await Promise.race([
            getFirestoreClient().collection("health").limit(1).get(),
            rejectAfter(PROBE_TIMEOUT_MS, "Firestore"),
          ]);
        } catch (err) {
          storageOk = false;
          storageError = (err as Error).message;
        }
      } else if (isGcsMode()) {
        try {
          await Promise.race([
            getBucket().getMetadata(),
            rejectAfter(PROBE_TIMEOUT_MS, "GCS"),
          ]);
        } catch (err) {
          storageOk = false;
          storageError = (err as Error).message;
        }
      }

      return { storageOk, storageError };
    }

    Promise.race([runProbes(), rejectAfter(HANDLER_TIMEOUT_MS, "health handler")])
      .then(({ storageOk, storageError }) => {
        const status = storageOk ? 200 : 503;
        res.status(status).json({
          ok: storageOk,
          storage: storageOk ? "ok" : storageError,
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

  const globalErrorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    console.error(`[error] ${req.method} ${req.path}`, err instanceof Error ? err : new Error(String(err)));
    res.status(500).json({ error: "internal_error", message: "An unexpected error occurred." });
  };
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

  const server = createApp().listen(PORT, () => {
    const storageMode = isFirestoreMode() ? "Firestore" : isGcsMode() ? "GCS" : "in-memory";
    console.log(
      `GCOS backend listening on http://localhost:${PORT}\n` +
        `  storage: ${storageMode}\n` +
        `  auth:    ${process.env.GOOGLE_OAUTH_CLIENT_ID ? "Google OAuth" : "anonymous (no OAuth client)"}`
    );
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

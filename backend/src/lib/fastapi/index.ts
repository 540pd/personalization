import { isDeployed } from "../allowedOrigins.js";
import { createFastApiClient } from "./client.js";
import { fastApiConfig } from "./config.js";
import { createFakeFastApiClient } from "./fake.js";
import { fetchTransport, googleServiceTokens } from "./transport.js";
import type { FastApiClient } from "./types.js";

export * from "./types.js";
export { createFastApiClient } from "./client.js";
export { createFakeFastApiClient } from "./fake.js";
export { fastApiConfig } from "./config.js";

/**
 * Real service, or the placeholder (#494), for serviceModes and /api/health.
 * Parses the config, so a bad FASTAPI_* value stops startup.
 */
export function fastApiMode(env: NodeJS.ProcessEnv = process.env): "service" | "placeholder" {
  return fastApiConfig(env) ? "service" : "placeholder";
}

let shared: FastApiClient | null = null;

/**
 * The backend's FastAPI client: the real one when FASTAPI_BASE_URL is set, the
 * fake otherwise. A deployed backend refuses the fake here, when something
 * first needs FastAPI, rather than at startup: until a route uses it, a
 * deployment without the service is fine.
 */
export function getFastApiClient(): FastApiClient {
  if (shared) return shared;
  const config = fastApiConfig();
  if (!config) {
    if (isDeployed()) {
      throw new Error("FASTAPI_BASE_URL is not set: a deployed backend can't use the placeholder FastAPI (docs/switching-to-gcp.md).");
    }
    console.warn("[fastapi] FASTAPI_BASE_URL not set — using the placeholder FastAPI (in memory, checks nothing).");
    shared = createFakeFastApiClient();
  } else {
    shared = createFastApiClient({ config, tokens: googleServiceTokens(config.audience), transport: fetchTransport });
  }
  return shared;
}

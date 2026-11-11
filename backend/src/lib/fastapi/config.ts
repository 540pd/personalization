import { isDeployed } from "../allowedOrigins.js";
import type { TimeoutKind } from "./types.js";

// FastAPI client settings (#494). All placeholders until the service exists:
// the URL and audience names are proposals, and the timeouts are to be agreed
// with #363. FASTAPI_BASE_URL unset means the fake client (fake.ts).

export interface FastApiConfig {
  /** No trailing slash. */
  baseUrl: string;
  /** The service token's audience: the Cloud Run URL unless set otherwise. */
  audience: string;
  timeoutsMs: Record<TimeoutKind, number>;
  /** A bigger answer is refused, not buffered. */
  maxResponseBytes: number;
}

export const DEFAULT_TIMEOUTS_MS: Record<TimeoutKind, number> = {
  // The 15 s job-acceptance budget (docs/aryash rules): creating a job only queues it.
  job: 15_000,
  skills: 10_000,
  // One model call to draft a SKILL.md (PACK PY-04).
  helper: 30_000,
};

export const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;

const ms = (env: NodeJS.ProcessEnv, name: string, fallback: number, max: number): number => {
  const text = env[name]?.trim();
  if (!text) return fallback;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 100 || value > max) {
    throw new Error(`${name} must be a whole number of milliseconds from 100 to ${max}, got "${text}".`);
  }
  return value;
};

/**
 * The config from the environment, or null when FASTAPI_BASE_URL is unset (use
 * the fake). Throws on a value it can't use, so a typo stops startup.
 */
export function fastApiConfig(env: NodeJS.ProcessEnv = process.env, deployed = isDeployed(env)): FastApiConfig | null {
  const raw = env.FASTAPI_BASE_URL?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("FASTAPI_BASE_URL is not a URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("FASTAPI_BASE_URL must be http(s).");
  if (deployed && url.protocol !== "https:") throw new Error("FASTAPI_BASE_URL must be HTTPS on a deployed backend.");
  if (url.search || url.hash || url.username || url.password) throw new Error("FASTAPI_BASE_URL must be a plain base URL.");
  const baseUrl = url.toString().replace(/\/+$/, "");
  return {
    baseUrl,
    audience: env.FASTAPI_AUDIENCE?.trim() || baseUrl,
    timeoutsMs: {
      job: ms(env, "FASTAPI_JOB_TIMEOUT_MS", DEFAULT_TIMEOUTS_MS.job, 60_000),
      skills: ms(env, "FASTAPI_SKILLS_TIMEOUT_MS", DEFAULT_TIMEOUTS_MS.skills, 60_000),
      helper: ms(env, "FASTAPI_HELPER_TIMEOUT_MS", DEFAULT_TIMEOUTS_MS.helper, 120_000),
    },
    maxResponseBytes: DEFAULT_MAX_RESPONSE_BYTES,
  };
}

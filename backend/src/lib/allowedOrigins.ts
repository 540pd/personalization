// The frontend origins this backend serves: ALLOWED_ORIGINS, read once and
// shared by CORS (server.ts) and the CSRF Origin guard (#490,
// middleware/requireTrustedOrigin.ts), so the two can never disagree.

/** Local default when ALLOWED_ORIGINS is unset: the Next.js dev server, by either local name. */
export const DEV_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

/**
 * `value` as a bare origin (scheme, host, port), or null when it isn't one:
 * a path, query, credentials or anything URL can't parse. "https://a.com/"
 * and "https://a.com" are the same origin; "https://a.com/x" is not one.
 */
export function asOrigin(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) return null;
  return url.origin;
}

/**
 * The allowlist from `ALLOWED_ORIGINS` (comma-separated). Throws on an entry
 * that isn't a bare origin, or one that isn't HTTPS on a deployed backend, so
 * a typo stops startup instead of silently letting nothing (or too much) in.
 */
export function allowedOrigins(env: NodeJS.ProcessEnv = process.env, deployed = isDeployed(env)): string[] {
  const raw = env.ALLOWED_ORIGINS?.trim();
  if (!raw) return deployed ? [] : DEV_ORIGINS;
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const origin = asOrigin(entry);
      if (!origin) throw new Error(`ALLOWED_ORIGINS: "${entry}" is not an origin (scheme://host[:port], nothing after it).`);
      if (deployed && !origin.startsWith("https://")) {
        throw new Error(`ALLOWED_ORIGINS: "${entry}" must be HTTPS on a deployed backend.`);
      }
      return origin;
    });
}

export function isDeployed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production" || !!env.K_SERVICE;
}

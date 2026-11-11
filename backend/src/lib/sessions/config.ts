// Session settings (#489). SESSION_MODE picks the kind of session:
//   jwt     today's signed 30-day token (ADR 001), the default
//   opaque  a random ID in the cookie, checked against the store on every request
// Switching to opaque signs everyone out once (old cookies aren't session IDs).
// The timeouts are placeholders until the team agrees them.

export type SessionMode = "jwt" | "opaque";

export interface SessionConfig {
  mode: SessionMode;
  idleMs: number;
  absoluteMs: number;
  /** Use is written back at most this often: idle renewal is throttled. */
  touchAfterMs: number;
  /** How long a resolved session is trusted without reading the store again. */
  cacheMs: number;
}

const DAY = 24 * 60 * 60;
export const DEFAULT_IDLE_SECONDS = 7 * DAY;
export const DEFAULT_ABSOLUTE_SECONDS = 30 * DAY;
export const SESSION_CACHE_MS = 10_000;

const seconds = (env: NodeJS.ProcessEnv, name: string, fallback: number): number => {
  const text = env[name]?.trim();
  if (!text) return fallback;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 300 || value > 365 * DAY) {
    throw new Error(`${name} must be a whole number of seconds from 300 to ${365 * DAY}, got "${text}".`);
  }
  return value;
};

/** From the environment; throws on a value it can't use, so a typo stops startup. */
export function sessionConfig(env: NodeJS.ProcessEnv = process.env): SessionConfig {
  const modeText = env.SESSION_MODE?.trim() || "jwt";
  if (modeText !== "jwt" && modeText !== "opaque") throw new Error(`SESSION_MODE must be "jwt" or "opaque", got "${modeText}".`);
  const idle = seconds(env, "SESSION_IDLE_SECONDS", DEFAULT_IDLE_SECONDS);
  const absolute = seconds(env, "SESSION_ABSOLUTE_SECONDS", DEFAULT_ABSOLUTE_SECONDS);
  if (idle > absolute) throw new Error("SESSION_IDLE_SECONDS can't be longer than SESSION_ABSOLUTE_SECONDS.");
  return {
    mode: modeText,
    idleMs: idle * 1000,
    absoluteMs: absolute * 1000,
    // A quarter of the idle window, at most an hour: frequent enough that a
    // session in use never idles out, rare enough not to write on every request.
    touchAfterMs: Math.min(60 * 60 * 1000, (idle * 1000) / 4),
    cacheMs: SESSION_CACHE_MS,
  };
}

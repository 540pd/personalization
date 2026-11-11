import type { Request, Response } from "express";
import { SESSION_TOKEN_TTL_SECONDS } from "./sessionToken.js";

/**
 * The HttpOnly cookie that carries the session JWT (ADR 001). The frontend's
 * /api/proxy forwards only this cookie, by this name, to the backend.
 */
export const SESSION_COOKIE = "gcos_session";

// A session older than this is re-issued on its next request (sliding
// renewal). Once a day, not on every request: a Set-Cookie on every answer
// would be noise in every response, and a day's slack on 30 is nothing.
export const SESSION_RENEW_AFTER_SECONDS = 60 * 60 * 24;

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
});

/** The session cookie's value, or undefined. Parsed by hand: one cookie does
 * not warrant cookie-parser. */
export function readSessionCookie(req: Request): string | undefined {
  const header = req.header("Cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0 || part.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(value) || undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Sets the cookie: host-only (no Domain), HttpOnly, Secure when deployed.
 * `maxAgeMs` defaults to the JWT's lifetime; opaque sessions pass their own. */
export function setSessionCookie(res: Response, value: string, maxAgeMs = SESSION_TOKEN_TTL_SECONDS * 1000): void {
  res.cookie(SESSION_COOKIE, value, { ...cookieOptions(), maxAge: maxAgeMs });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

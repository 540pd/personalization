import type { NextFunction, Request, RequestHandler, Response } from "express";
import { asOrigin } from "../lib/allowedOrigins.js";
import { readSessionCookie } from "../lib/sessionCookie.js";

// CSRF protection (#490, PACK NJS-04; docs/aryash rule 4). The session is an
// HttpOnly cookie the browser attaches by itself, so a request that changes
// something must also prove it came from our own frontend: its Origin must be
// exactly one of ALLOWED_ORIGINS. The Next.js proxy forwards the browser's
// Origin (frontend/src/app/api/proxy/[...path]/route.ts).
//
// Guarded: POST, PUT, PATCH and DELETE that carry the session cookie, and the
// session routes (sign-in, sign-out, dev sign-in) with or without one.
// Not guarded, and why:
// - GET, HEAD, OPTIONS: they change nothing; they are still authenticated.
// - A request with no session cookie, outside the session routes: it is
//   authenticated by a Bearer header or not at all, and another site can't
//   make a browser send a header of its choosing without CORS letting it.
//   That covers Cloud Tasks' worker route, which verifies its own OIDC token.
// No header (X-Forwarded-Host, Referer, ...) can stand in for Origin or
// exempt a request.

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SESSION_ROUTES = /^\/api\/session(\/|$)/;

export type OriginRefusal = "missing" | "null" | "malformed" | "not allowed";

/** Why `origin` (the raw header) is refused, or null when it's on the list. */
export function originRefusal(origin: string | undefined, allowed: readonly string[]): OriginRefusal | null {
  if (origin === undefined || origin === "") return "missing";
  if (origin === "null") return "null";
  const parsed = asOrigin(origin);
  // The header must already be a bare origin: "https://a.com/" or one with a
  // path is not what a browser sends, so it is malformed, not "close enough".
  if (!parsed || parsed !== origin.toLowerCase()) return "malformed";
  return allowed.includes(parsed) ? null : "not allowed";
}

/** True when this request must pass the Origin check. */
export function needsOriginCheck(req: Request): boolean {
  if (!UNSAFE.has(req.method)) return false;
  return SESSION_ROUTES.test(req.path) || readSessionCookie(req) !== undefined;
}

/** Rejects a guarded request whose Origin isn't on `allowed`, with 403 origin_not_allowed. */
export function requireTrustedOrigin(allowed: readonly string[]): RequestHandler {
  return function requireTrustedOriginMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!needsOriginCheck(req)) {
      next();
      return;
    }
    const origin = req.header("Origin");
    const refusal = originRefusal(origin, allowed);
    if (!refusal) {
      next();
      return;
    }
    // Audit line: method, path and the Origin it came from; never the cookie,
    // other headers or the body.
    const shown = origin ? ` from ${JSON.stringify(origin.slice(0, 200))}` : "";
    console.warn(`[requireTrustedOrigin] refused ${req.method} ${req.path}${shown}: origin ${refusal}`);
    res.status(403).json({
      error: "origin_not_allowed",
      message: "This request didn't come from the app. Reload the page and try again.",
    });
  };
}

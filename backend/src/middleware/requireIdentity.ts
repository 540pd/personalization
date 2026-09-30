import { timingSafeEqual } from "crypto";
import { OAuth2Client } from "google-auth-library";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { verifySessionToken } from "../lib/sessionToken.js";

declare global {
  namespace Express {
    interface Request {
      identity: { email: string };
    }
  }
}

/**
 * AUTH_MODE controls behaviour when GOOGLE_OAUTH_CLIENT_ID is missing:
 *
 * - OAuth var present → auth is always required.
 * - OAuth var missing, not deployed (no K_SERVICE / NODE_ENV=production) →
 *   anonymous mode: every request gets the synthetic "anonymous" identity.
 *   This is the local dev "boot without OAuth" path.
 * - OAuth var missing AND deployed → refuse to start, UNLESS both
 *   AUTH_MODE=anonymous AND IAP_PROTECTED=true are explicitly set (operator
 *   declares that IAP sits in front of this service).
 */
const GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const OAUTH_CONFIGURED = !!GOOGLE_OAUTH_CLIENT_ID;

const ALLOWED_EMAIL_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS ?? "accenture.com")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

const EXPLICIT_AUTH_MODE = process.env.AUTH_MODE;
const IS_DEPLOYED = process.env.NODE_ENV === "production" || !!process.env.K_SERVICE;
const IAP_PROTECTED = /^(true|1)$/i.test(process.env.IAP_PROTECTED?.trim() ?? "");

export const ANONYMOUS_IDENTITY = "anonymous";

export type AuthMode = "anonymous" | "required";

export function isAllowedEmailDomain(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return !!domain && ALLOWED_EMAIL_DOMAINS.includes(domain);
}

function computeAuthMode(): AuthMode {
  if (OAUTH_CONFIGURED) return "required";
  if (IS_DEPLOYED) {
    if (EXPLICIT_AUTH_MODE === "anonymous" && IAP_PROTECTED) return "anonymous";
    throw new Error(
      "Refusing to start: deployed environment detected (NODE_ENV=production or K_SERVICE set) " +
        "but GOOGLE_OAUTH_CLIENT_ID is not set. Fix by (a) setting GOOGLE_OAUTH_CLIENT_ID, or " +
        "(b) setting AUTH_MODE=anonymous AND IAP_PROTECTED=true if IAP sits in front of this service."
    );
  }
  console.warn(
    "[requireIdentity] GOOGLE_OAUTH_CLIENT_ID not set — booting in anonymous mode (local dev only). " +
      `Every request is attributed to the shared "${ANONYMOUS_IDENTITY}" identity.`
  );
  return "anonymous";
}

const AUTH_MODE: AuthMode = computeAuthMode();

export function getAuthMode(): AuthMode {
  return AUTH_MODE;
}

type IdentityErrorCode =
  | "token_missing"
  | "token_invalid"
  | "token_expired"
  | "domain_not_allowed";

function sendError(res: Response, code: IdentityErrorCode, message: string): void {
  res.status(401).json({ error: code, message });
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Keep constantTimeEquals in scope — may be needed for future service keys.
void constantTimeEquals;

function classifyVerifyError(err: unknown): IdentityErrorCode {
  const message = err instanceof Error ? err.message : String(err);
  if (/expired|used too late/i.test(message)) return "token_expired";
  return "token_invalid";
}

const oauthClient = new OAuth2Client();

export function requireIdentity(): RequestHandler {
  return async function requireIdentityMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    if (AUTH_MODE === "anonymous") {
      req.identity = { email: ANONYMOUS_IDENTITY };
      next();
      return;
    }

    // Prefer X-User-Identity: on a deployed frontend its /api/proxy route
    // mints a Cloud-Run-to-Cloud-Run OIDC infra token into Authorization and
    // forwards the user's real credential here to avoid collision.
    const userIdentityHeader =
      req.header("X-User-Identity") ?? req.header("Authorization");
    const idToken = userIdentityHeader?.startsWith("Bearer ")
      ? userIdentityHeader.slice("Bearer ".length).trim()
      : undefined;

    if (!idToken) {
      sendError(
        res,
        "token_missing",
        "No X-User-Identity/Authorization: Bearer <token> header present."
      );
      return;
    }

    // Check our own session token first (local signature — no network call).
    const sessionResult = verifySessionToken(idToken);
    if (sessionResult.ok) {
      if (!isAllowedEmailDomain(sessionResult.email)) {
        sendError(res, "domain_not_allowed", "This account's email domain is not permitted.");
        return;
      }
      req.identity = { email: sessionResult.email };
      next();
      return;
    }
    if (sessionResult.expired) {
      sendError(res, "token_expired", "Session has expired.");
      return;
    }

    // Fall through to Google ID token verification.
    try {
      const ticket = await oauthClient.verifyIdToken({
        idToken,
        audience: GOOGLE_OAUTH_CLIENT_ID as string,
      });
      const payload = ticket.getPayload();
      if (!payload?.email) {
        sendError(res, "token_invalid", "Verified token had no email claim.");
        return;
      }
      if (!isAllowedEmailDomain(payload.email)) {
        sendError(res, "domain_not_allowed", "This account's email domain is not permitted.");
        return;
      }
      req.identity = { email: payload.email };
      next();
    } catch (err) {
      const code = classifyVerifyError(err);
      console.error(`[requireIdentity] ID token verification failed (${code})`);
      sendError(
        res,
        code,
        code === "token_expired" ? "ID token has expired." : "ID token is invalid."
      );
    }
  };
}

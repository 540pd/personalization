import { timingSafeEqual } from "crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { googleIdTokenClient, googleIdTokenConfig, verifyGoogleIdToken } from "../lib/googleIdToken.js";
import { owners, processLinkKey } from "../lib/identity/index.js";
import { signSessionToken, verifySessionToken } from "../lib/sessionToken.js";
import { readSessionCookie, SESSION_RENEW_AFTER_SECONDS, setSessionCookie } from "../lib/sessionCookie.js";
import { sessionConfig, sessions, type SessionRefusal } from "../lib/sessions/index.js";

declare global {
  namespace Express {
    interface Request {
      /**
       * `email` is what data is keyed by today. `ownerKey` (#488) is the
       * owner a verified Google sign-in belongs to; server-side only, never
       * sent to the browser. Absent for session cookies, dev sign-in and
       * anonymous mode until owner keys replace email (migration issue).
       */
      identity: { email: string; ownerKey?: string };
      /** How `identity` was established, for the session routes (#489). */
      authenticatedBy?: "anonymous" | "session" | "google";
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

/**
 * "dev" is the placeholder for Google sign-in (#334): anyone signs in with
 * any allowed email they type (POST /api/session/dev-sign-in), and from
 * there it is the production path -- the session cookie, renewal, sign-out.
 * Local only: a deployed backend refuses to start with it.
 */
export type AuthMode = "anonymous" | "dev" | "required";

export function isAllowedEmailDomain(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return !!domain && ALLOWED_EMAIL_DOMAINS.includes(domain);
}

function computeAuthMode(): AuthMode {
  if (EXPLICIT_AUTH_MODE === "dev") {
    if (IS_DEPLOYED) {
      throw new Error(
        "Refusing to start: AUTH_MODE=dev (the dev sign-in placeholder) on a deployed environment. " +
          "Unset AUTH_MODE and set GOOGLE_OAUTH_CLIENT_ID (docs/switching-to-gcp.md)."
      );
    }
    return "dev";
  }
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
  | "domain_not_allowed"
  // #488: a verified account whose owner is disabled, or the owner store down.
  | "account_disabled"
  | "dependency_unavailable";

const STATUS: Partial<Record<IdentityErrorCode, number>> = { account_disabled: 403, dependency_unavailable: 503 };

function sendError(res: Response, code: IdentityErrorCode, message: string): void {
  res.status(STATUS[code] ?? 401).json({ error: code, message });
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Keep constantTimeEquals in scope — may be needed for future service keys.
void constantTimeEquals;

// Read once, like the rest of this module's env. A bad value (e.g. the clock
// skew) throws here, so the backend refuses to start rather than verify loosely.
const GOOGLE_ID_TOKEN_CONFIG = googleIdTokenConfig();
if (AUTH_MODE === "required" && GOOGLE_ID_TOKEN_CONFIG.hostedDomains.length === 0) {
  console.warn("[requireIdentity] ALLOWED_HOSTED_DOMAINS is empty: every Google sign-in will be refused.");
}
// Identity links need their key (#488): read now, so a deployed backend
// without IDENTITY_LINK_HMAC_KEY refuses to start rather than fail sign-ins.
if (AUTH_MODE === "required") processLinkKey();

// Which session (#489): "jwt", today's signed token, or "opaque", a random ID
// checked against the session store on every request. Read once; a bad value
// stops startup.
const SESSION_MODE = sessionConfig().mode;

export function getSessionMode(): typeof SESSION_MODE {
  return SESSION_MODE;
}

/** An opaque session's refusal, as the error the frontend already handles. */
function refuseSession(res: Response, reason: SessionRefusal): void {
  if (reason === "disabled") sendError(res, "account_disabled", REFUSAL_MESSAGES.account_disabled);
  else if (reason === "unavailable") sendError(res, "dependency_unavailable", REFUSAL_MESSAGES.dependency_unavailable);
  else if (reason === "idle_expired" || reason === "absolute_expired") sendError(res, "token_expired", "Session has expired.");
  else sendError(res, "token_missing", "The session cookie is not valid.");
}

/** Identifies the request from its session cookie, renewing an old one. */
async function identifyFromCookie(req: Request, res: Response, next: NextFunction): Promise<void> {
  const cookie = readSessionCookie(req);
  if (!cookie) {
    sendError(res, "token_missing", "No bearer token or session cookie present.");
    return;
  }
  if (SESSION_MODE === "opaque") {
    // Every check, every request: deadlines, revocation, the owner's status.
    const session = await sessions().resolve(cookie);
    if (!session.ok) {
      if (session.reason === "unavailable" || session.reason === "disabled") console.error(`[requireIdentity] session refused (${session.reason})`);
      refuseSession(res, session.reason);
      return;
    }
    if (!isAllowedEmailDomain(session.record.email)) {
      sendError(res, "domain_not_allowed", "This account's email domain is not permitted.");
      return;
    }
    req.identity = session.record.ownerKey ? { email: session.record.email, ownerKey: session.record.ownerKey } : { email: session.record.email };
    req.authenticatedBy = "session";
    next();
    return;
  }
  const session = verifySessionToken(cookie);
  if (!session.ok) {
    // Only ours is ever set under this name: a cookie that fails our
    // signature is not a Google token to try next, just not a session.
    if (session.expired) sendError(res, "token_expired", "Session has expired.");
    else sendError(res, "token_missing", "The session cookie is not valid.");
    return;
  }
  if (!isAllowedEmailDomain(session.email)) {
    sendError(res, "domain_not_allowed", "This account's email domain is not permitted.");
    return;
  }
  // Sliding renewal (ADR 001): a session in use never runs out.
  if (Date.now() / 1000 - session.issuedAt > SESSION_RENEW_AFTER_SECONDS) {
    const renewed = signSessionToken(session.email);
    if (renewed) setSessionCookie(res, renewed);
  }
  req.identity = { email: session.email };
  req.authenticatedBy = "session";
  next();
}

/**
 * The signed-in sender's email, when the request carries a session of ours;
 * otherwise null, and never a refusal. For routes anyone may call that
 * still note who sent it (the support form, #428). A Google token is not
 * checked here: that is a network call this note is not worth.
 */
export async function signedInEmail(req: Request): Promise<string | null> {
  if (AUTH_MODE === "anonymous") return null;
  if (SESSION_MODE === "opaque") {
    const session = await sessions().resolve(readSessionCookie(req));
    return session.ok ? session.record.email : null;
  }
  const header = IS_DEPLOYED ? req.header("X-User-Identity") : req.header("X-User-Identity") ?? req.header("Authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : undefined;
  for (const token of [bearer, readSessionCookie(req)]) {
    if (!token) continue;
    const session = verifySessionToken(token);
    if (session.ok) return session.email;
  }
  return null;
}

/**
 * Gates a route on a signed-in identity. `signIn: true` is for the one route
 * that exchanges a Google ID token for a session (POST /api/session/refresh):
 * with opaque sessions, no other route takes a Google token, so every request
 * after sign-in goes through the session's checks.
 */
export function requireIdentity(options: { signIn?: boolean } = {}): RequestHandler {
  return async function requireIdentityMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    if (AUTH_MODE === "anonymous") {
      req.identity = { email: ANONYMOUS_IDENTITY };
      req.authenticatedBy = "anonymous";
      next();
      return;
    }

    // The user's bearer token. Deployed, the frontend's /api/proxy mints a
    // Cloud-Run-to-Cloud-Run OIDC infra token into Authorization and moves
    // the user's credential to X-User-Identity, so Authorization is never
    // the user's there; locally it is forwarded as is.
    const userIdentityHeader = IS_DEPLOYED
      ? req.header("X-User-Identity")
      : req.header("X-User-Identity") ?? req.header("Authorization");
    const idToken = userIdentityHeader?.startsWith("Bearer ")
      ? userIdentityHeader.slice("Bearer ".length).trim()
      : undefined;

    // No bearer token: the session cookie, which a reload still carries
    // after the in-memory Google token is gone. A bearer token wins, so a
    // fresh sign-in is not blocked by an expired cookie.
    // With opaque sessions a bearer token is only a credential on the sign-in
    // route; anywhere else it is ignored and the cookie decides.
    if (!idToken || (SESSION_MODE === "opaque" && !options.signIn)) {
      await identifyFromCookie(req, res, next);
      return;
    }

    // Opaque sessions have no signed token to check: straight to Google.
    if (SESSION_MODE === "opaque") {
      await identifyFromGoogle(idToken, req, res, next);
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
      req.authenticatedBy = "session";
      next();
      return;
    }
    if (sessionResult.expired) {
      sendError(res, "token_expired", "Session has expired.");
      return;
    }

    // Dev sign-in issues only our own session tokens: there is no Google
    // client to verify anything else against.
    if (AUTH_MODE === "dev") {
      sendError(res, "token_invalid", "Dev sign-in accepts only its own session.");
      return;
    }

    await identifyFromGoogle(idToken, req, res, next);
  };
}

/**
 * Google ID token verification (lib/googleIdToken.ts), then the account's
 * owner (#488): only what the verified token says counts, never the body.
 */
async function identifyFromGoogle(idToken: string, req: Request, res: Response, next: NextFunction): Promise<void> {
  const result = await verifyGoogleIdToken(idToken, GOOGLE_ID_TOKEN_CONFIG, googleIdTokenClient);
  if (!result.ok) {
    // The code and a short reason only: never the token or its claims.
    console.error(`[requireIdentity] ID token refused (${result.code}: ${result.reason})`);
    sendError(res, result.code, REFUSAL_MESSAGES[result.code]);
    return;
  }
  // The account's owner, made on its first sign-in (#488). Data stays keyed
  // by email for now; the owner key is recorded and passed on server-side.
  const owner = await owners().findOrCreateOwner(result.identity);
  if (!owner.ok) {
    console.error(`[requireIdentity] owner refused (${owner.code}: ${owner.reason})`);
    if (owner.code === "account_disabled") sendError(res, "account_disabled", REFUSAL_MESSAGES.account_disabled);
    else sendError(res, "dependency_unavailable", REFUSAL_MESSAGES.dependency_unavailable);
    return;
  }
  req.identity = { email: result.identity.email, ownerKey: owner.ownerKey };
  req.authenticatedBy = "google";
  next();
}

const REFUSAL_MESSAGES: Record<IdentityErrorCode, string> = {
  token_missing: "No bearer token or session cookie present.",
  token_invalid: "ID token is invalid.",
  token_expired: "ID token has expired.",
  domain_not_allowed: "This account's email domain is not permitted.",
  account_disabled: "This account has been disabled.",
  dependency_unavailable: "Sign-in is unavailable right now. Try again shortly.",
};

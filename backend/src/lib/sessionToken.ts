import jwt from "jsonwebtoken";

/**
 * This app's own long-lived session, layered on top of Google ID token
 * verification in middleware/requireIdentity.ts.
 *
 * Why this exists: a Google ID token is capped at ~1 hour by Google. Without
 * this, every page reload needs a fresh interactive Google sign-in. Issuing our
 * own signed, longer-lived token means a returning user's browser can carry
 * proof of a past successful Google verification (via an HttpOnly cookie) without
 * touching Google again until this token itself expires.
 *
 * SESSION_SECRET follows the optional-key convention: unset means the feature
 * is inert (no token issued, no cookie set) rather than a module-level throw.
 */
const SESSION_SECRET = process.env.SESSION_SECRET;

// 30 days: long enough that "log in once" holds for a normal work cadence,
// short enough that a stolen cookie doesn't grant indefinite access.
// Sliding: routes/session.ts mints a fresh one on every successful check.
export const SESSION_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

export function isSessionTokenConfigured(): boolean {
  return !!SESSION_SECRET;
}

export interface SessionTokenPayload {
  email: string;
}

/** Returns null when SESSION_SECRET isn't configured — callers degrade to
 * "no session token issued", never a thrown error. */
export function signSessionToken(email: string): string | null {
  if (!SESSION_SECRET) return null;
  return jwt.sign({ email } satisfies SessionTokenPayload, SESSION_SECRET, {
    expiresIn: SESSION_TOKEN_TTL_SECONDS,
  });
}

export type SessionTokenVerifyResult =
  // issuedAt (seconds since the epoch) lets the caller renew an old one.
  | { ok: true; email: string; issuedAt: number }
  // Not configured, or token isn't ours (wrong signature/malformed).
  // Falls through to Google verification — never surfaced as an error.
  | { ok: false; expired: false }
  // Verified OUR signature, but past exp — report token_expired directly
  // rather than wasting a call attempting Google verification.
  | { ok: false; expired: true };

export function verifySessionToken(token: string): SessionTokenVerifyResult {
  if (!SESSION_SECRET) return { ok: false, expired: false };
  try {
    const payload = jwt.verify(token, SESSION_SECRET) as SessionTokenPayload & { iat?: number };
    if (!payload?.email || typeof payload.iat !== "number") return { ok: false, expired: false };
    return { ok: true, email: payload.email, issuedAt: payload.iat };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) return { ok: false, expired: true };
    return { ok: false, expired: false };
  }
}

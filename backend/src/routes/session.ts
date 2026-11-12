import { Router, type RequestHandler, type Response } from "express";
import { getAuthMode, getSessionMode, isAllowedEmailDomain, requireIdentity } from "../middleware/requireIdentity.js";
import { refreshSessionToken } from "../services/authService.js";
import { clearSessionCookie, readSessionCookie, setSessionCookie } from "../lib/sessionCookie.js";
import { signSessionToken } from "../lib/sessionToken.js";
import { sessions } from "../lib/sessions/index.js";
import { sendValidationError } from "../common/errors.js";

export const sessionRouter = Router();

// Sign-in and session answers are never cached by a browser or proxy (#489).
const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
};
sessionRouter.use("/session", noStore);

/**
 * Opaque sessions (#489): a new session for `who`, set as the cookie. The
 * session ID goes in the cookie only; the answer is `{ ok: true }`. Answers
 * 503 when the session store can't take it, setting no cookie.
 */
async function startOpaqueSession(res: Response, who: { email: string; ownerKey: string | null }): Promise<void> {
  try {
    const { id, record } = await sessions().create(who);
    setSessionCookie(res, id, record.absoluteExpiresAt - record.createdAt);
    res.json({ ok: true });
  } catch {
    console.error("[session] could not create a session (store unavailable)");
    res.status(503).json({ error: "dependency_unavailable", message: "Sign-in is unavailable right now. Try again shortly." });
  }
}

// POST /api/session/refresh — exchanges a verified identity for the session.
// Called after a Google sign-in, with the ID token as a bearer: mints a
// fresh 30-day JWT and sets it as an HttpOnly cookie, so later requests (and
// reloads) are identified by the cookie alone.
sessionRouter.post("/session/refresh", requireIdentity({ signIn: true }), async (req, res) => {
  if (getSessionMode() === "opaque") {
    // Already signed in by the cookie: that session carries on as it is.
    if (req.authenticatedBy !== "google") {
      res.json({ ok: true });
      return;
    }
    // A fresh sign-in replaces whatever session this browser had.
    await sessions().revoke(readSessionCookie(req)).catch(() => {});
    await startOpaqueSession(res, { email: req.identity.email, ownerKey: req.identity.ownerKey ?? null });
    return;
  }
  const session = refreshSessionToken(req.identity.email);
  if (!session.configured) {
    res.json({ ok: true, note: "session tokens not configured" });
    return;
  }

  if (!session.token) {
    res.status(500).json({ error: "internal_error", message: "Failed to sign session token." });
    return;
  }

  setSessionCookie(res, session.token);
  res.json({ ok: true });
});

// GET /api/session — who the session (or bearer token) is. The frontend asks
// on load: a 200 means it can show the board without a Google prompt.
sessionRouter.get("/session", requireIdentity(), (req, res) => {
  res.json({ email: req.identity.email });
});

// POST /api/session/sign-out — clears the session cookie. Not gated: an
// expired or missing session must still be able to sign out. With opaque
// sessions (#489) the server record is revoked too, so a copy of the cookie
// is refused from then on; a JWT stays valid until it expires.
sessionRouter.post("/session/sign-out", async (req, res) => {
  if (getSessionMode() === "opaque") {
    try {
      await sessions().revoke(readSessionCookie(req));
    } catch {
      // Still clear the cookie; the record expires on its own.
      console.error("[session] could not revoke on sign-out (store unavailable)");
    }
  }
  clearSessionCookie(res);
  res.status(204).end();
});

// POST /api/session/dev-sign-in — the placeholder for Google (#334): the
// email typed is who you are. Only in AUTH_MODE=dev, which a deployed
// backend refuses; in any other mode the route is not there at all.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

sessionRouter.post("/session/dev-sign-in", (req, res, next) => {
  if (getAuthMode() !== "dev") return next();
  const { email } = (req.body ?? {}) as { email?: unknown };
  const address = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!EMAIL.test(address) || address.length > 254) {
    sendValidationError(res, "Enter an email address.");
    return;
  }
  // The same allowlist as Google sign-in, so the refused account can be seen.
  if (!isAllowedEmailDomain(address)) {
    res.status(401).json({ error: "domain_not_allowed", message: "This account's email domain is not permitted." });
    return;
  }
  if (getSessionMode() === "opaque") {
    // Dev sign-in has no Google account, so no owner.
    void startOpaqueSession(res, { email: address, ownerKey: null }).catch(next);
    return;
  }
  const token = signSessionToken(address);
  if (!token) {
    res.status(500).json({ error: "internal_error", message: "Failed to sign session token." });
    return;
  }
  setSessionCookie(res, token);
  res.json({ ok: true });
});

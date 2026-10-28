import { Router } from "express";
import { getAuthMode, isAllowedEmailDomain, requireIdentity } from "../middleware/requireIdentity.js";
import { refreshSessionToken } from "../services/authService.js";
import { clearSessionCookie, setSessionCookie } from "../lib/sessionCookie.js";
import { signSessionToken } from "../lib/sessionToken.js";
import { sendValidationError } from "../common/errors.js";

export const sessionRouter = Router();

// POST /api/session/refresh — exchanges a verified identity for the session.
// Called after a Google sign-in, with the ID token as a bearer: mints a
// fresh 30-day JWT and sets it as an HttpOnly cookie, so later requests (and
// reloads) are identified by the cookie alone.
sessionRouter.post("/session/refresh", requireIdentity(), (req, res) => {
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
// expired or missing session must still be able to sign out. The JWT itself
// stays valid until it expires (no server-side session store).
sessionRouter.post("/session/sign-out", (_req, res) => {
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
  const token = signSessionToken(address);
  if (!token) {
    res.status(500).json({ error: "internal_error", message: "Failed to sign session token." });
    return;
  }
  setSessionCookie(res, token);
  res.json({ ok: true });
});

import { Router } from "express";
import { requireIdentity } from "../middleware/requireIdentity.js";
import { refreshSessionToken } from "../services/authService.js";
import { clearSessionCookie, setSessionCookie } from "../lib/sessionCookie.js";

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

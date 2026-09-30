import { Router } from "express";
import { requireIdentity } from "../middleware/requireIdentity.js";
import {
  signSessionToken,
  isSessionTokenConfigured,
  SESSION_TOKEN_TTL_SECONDS,
} from "../lib/sessionToken.js";

export const sessionRouter = Router();

// POST /api/session/refresh — sliding session renewal.
// Called by the frontend proxy after every successful identity check.
// Mints a fresh 30-day JWT and sets it as an HttpOnly cookie.
sessionRouter.post("/session/refresh", requireIdentity(), (req, res) => {
  if (!isSessionTokenConfigured()) {
    res.json({ ok: true, note: "session tokens not configured" });
    return;
  }

  const token = signSessionToken(req.identity.email);
  if (!token) {
    res.status(500).json({ error: "internal_error", message: "Failed to sign session token." });
    return;
  }

  res.cookie("gcos_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TOKEN_TTL_SECONDS * 1000,
    path: "/",
  });

  res.json({ ok: true });
});

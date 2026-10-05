import { Router } from "express";
import { getAuthenticationConfig } from "../services/authService.js";

// GET /api/auth-config — NOT gated by requireIdentity (circular dependency:
// the frontend needs this to know whether to attempt sign-in at all).
// Returns { mode: "anonymous" | "required" } only — no client id, no secrets.
export const authConfigRouter = Router();

authConfigRouter.get("/auth-config", (_req, res) => {
  res.json(getAuthenticationConfig());
});

import { getAuthMode } from "../middleware/requireIdentity.js";
import {
  isSessionTokenConfigured,
  signSessionToken,
} from "../lib/sessionToken.js";

export function getAuthenticationConfig(): { mode: ReturnType<typeof getAuthMode> } {
  return { mode: getAuthMode() };
}

export function refreshSessionToken(email: string): {
  configured: boolean;
  token: string | null;
} {
  const configured = isSessionTokenConfigured();
  return {
    configured,
    token: configured ? signSessionToken(email) : null,
  };
}

// The backend's auth routes (#320, #321), through /api/proxy like every call.
//
// Plain fetch rather than apiFetch: these run before and during sign-in, so
// a 401 here is an answer ("not signed in"), not a session that just
// expired -- apiFetch would raise the expired banner for it.

export type AuthMode = "anonymous" | "required";

/** The backend's mode, or null when it cannot be reached or makes no sense. */
export async function fetchAuthMode(): Promise<AuthMode | null> {
  try {
    const res = await fetch("/api/proxy/auth-config");
    if (!res.ok) return null;
    const { mode } = (await res.json()) as { mode?: unknown };
    return mode === "anonymous" || mode === "required" ? mode : null;
  } catch {
    return null;
  }
}

/** The signed-in email from the session cookie; null for no session. Throws
 * when the backend cannot answer, which is not the same as signed out. */
export async function fetchSessionEmail(): Promise<string | null> {
  const res = await fetch("/api/proxy/session");
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Session check failed (${res.status})`);
  const { email } = (await res.json()) as { email?: unknown };
  return typeof email === "string" ? email : null;
}

export type StartSessionResult =
  /** `cookie` is false when the backend issues no session (no SESSION_SECRET):
   * the ID token then stays the credential until it expires. */
  | { ok: true; cookie: boolean }
  | { ok: false; error: string };

/** Exchanges a Google ID token for the session cookie. */
export async function startSession(idToken: string): Promise<StartSessionResult> {
  try {
    const res = await fetch("/api/proxy/session/refresh", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; note?: string };
    if (!res.ok) return { ok: false, error: body.error ?? `http_${res.status}` };
    return { ok: true, cookie: !body.note };
  } catch {
    return { ok: false, error: "unreachable" };
  }
}

/** Clears the session cookie. Best effort: signing out locally never waits on it. */
export async function endSession(): Promise<void> {
  try {
    await fetch("/api/proxy/session/sign-out", { method: "POST" });
  } catch {
    // Offline: the cookie stays until it expires, and the next sign-in replaces it.
  }
}

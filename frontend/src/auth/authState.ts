/**
 * Non-React module-singleton auth state shared between AuthProvider (the React
 * context that owns the sign-in lifecycle) and api.ts (plain functions that
 * need to attach the current ID token to every gated fetch and notify
 * AuthProvider when a 401 token_expired arrives on a call the user didn't
 * initiate through the sign-in flow itself).
 *
 * SECURITY: the ID token lives in a plain module-level variable — memory only,
 * cleared on tab close/reload, NEVER written to localStorage/sessionStorage/a
 * cookie/the URL.
 */

let currentIdToken: string | null = null;

export function setIdToken(token: string | null): void {
  currentIdToken = token;
}

export function getIdToken(): string | null {
  return currentIdToken;
}

// Per-tab session id (X-Session-Id header) — sessionStorage-scoped (NOT
// localStorage: each tab gets its own, matching the backend contract's
// "per tab" framing) so a reload keeps the same id but a new tab gets a fresh one.
const SESSION_STORAGE_KEY = "gcos-session-id";
let cachedSessionId: string | null = null;

function generateUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `sid-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getSessionId(): string {
  if (cachedSessionId) return cachedSessionId;
  if (typeof window === "undefined") return "server";

  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) {
      cachedSessionId = existing;
      return existing;
    }
  } catch {
    // sessionStorage unavailable (private-mode Safari, locked-down browser
    // policy) — fall through to an in-memory-only id for this page load.
  }

  const generated = generateUuid();
  cachedSessionId = generated;
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, generated);
  } catch {
    // Same defensive swallow as above.
  }
  return generated;
}

// Mid-session expiry notification: any api.ts call can detect a
// 401 token_expired on an already-authenticated tab and notify AuthProvider,
// which flips its sessionExpired flag without unmounting anything rendered.
type ExpiredListener = () => void;
const expiredListeners = new Set<ExpiredListener>();

export function onSessionExpired(listener: ExpiredListener): () => void {
  expiredListeners.add(listener);
  return () => {
    expiredListeners.delete(listener);
  };
}

export function notifySessionExpired(): void {
  expiredListeners.forEach((listener) => listener());
}

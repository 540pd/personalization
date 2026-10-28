"use client";

import { create } from "zustand";
import type { AuthMode } from "./authApi";

/**
 * Who is signed in, and where sign-in stands (#321).
 *
 * The single seam between the app and whatever establishes identity: the
 * rail reads `useIdentity()`, the gate reads `status`, and auth/session.ts is
 * the only writer. The Google ID token is not here -- it lives in
 * authState.ts, memory only.
 */

export interface Identity {
  name: string;
  email: string;
}

export type AuthStatus =
  /** Asking the backend: nothing is shown yet, so a signed-in user never
   * sees the sign-in screen flash. */
  | "checking"
  /** The backend needs no sign-in (local dev): the board, as before. */
  | "anonymous"
  | "signedOut"
  | "signedIn"
  /** A deployed build could not reach the backend to ask. */
  | "unreachable";

interface IdentityState {
  status: AuthStatus;
  /** How sign-in works here, once the backend has said: Google's button,
   * or the dev placeholder's email field (#334). */
  mode: AuthMode | null;
  identity: Identity | null;
  /** Signed in, but a request just answered that the session ended. */
  expired: boolean;
  /** Why the last sign-in failed, for the sign-in screen. */
  error: string | null;
}

export const useIdentityStore = create<IdentityState>(() => ({
  status: "checking",
  mode: null,
  identity: null,
  expired: false,
  error: null,
}));

export function useIdentity(): Identity | null {
  return useIdentityStore((s) => s.identity);
}

/** "ana.maria.silva@accenture.com" → "Ana Maria Silva": work addresses are
 * first.last, and the session carries only the email. */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ") || email;
}

export const identityOf = (email: string): Identity => ({ name: nameFromEmail(email), email });

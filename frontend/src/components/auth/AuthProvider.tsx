"use client";

// Google OAuth + session token auth context.
// TODO: wire Google Identity Services (GIS) sign-in flow.
// The ID token is held in authState.ts (memory-only) — never in this context.
// This context only holds derived UI state: authenticated, email, sessionExpired.

import { createContext, useContext, useState, type ReactNode } from "react";

interface AuthState {
  authenticated: boolean;
  email: string | null;
  sessionExpired: boolean;
}

interface AuthContextValue extends AuthState {
  signIn: () => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    authenticated: false,
    email: null,
    sessionExpired: false,
  });

  function signIn() {
    // TODO: trigger Google GIS sign-in popup, verify token via /api/proxy/auth-config,
    // call setIdToken() from authState.ts with the resulting ID token.
    console.warn("AuthProvider.signIn: not yet implemented");
  }

  function signOut() {
    setState({ authenticated: false, email: null, sessionExpired: false });
  }

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

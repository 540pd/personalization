"use client";

import { useEffect, type ReactNode } from "react";
import { checkSession } from "../session";
import { useIdentityStore } from "../useIdentity";
import SignInScreen from "./SignInScreen";
import SessionExpiredBanner from "./SessionExpiredBanner";
import "./Auth.scss";

/**
 * The board, once the backend says who is here (#321). While it is asked,
 * an empty page: neither the board, which would load and then vanish, nor
 * the sign-in screen, which would flash for someone already signed in.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const status = useIdentityStore((s) => s.status);
  const expired = useIdentityStore((s) => s.expired);

  useEffect(() => {
    void checkSession();
  }, []);

  if (status === "checking") return <div className="auth-screen" aria-busy="true" />;
  if (status === "signedOut" || status === "unreachable") return <SignInScreen />;
  return (
    <>
      {children}
      {expired && <SessionExpiredBanner />}
    </>
  );
}

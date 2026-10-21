"use client";

import { useIdentityStore } from "../useIdentity";
import GoogleSignInButton from "./GoogleSignInButton";

/**
 * Over the board when a request answers that the session ended (#321): the
 * board and anything unsaved stay on screen, and signing in here carries on.
 */
export default function SessionExpiredBanner() {
  const error = useIdentityStore((s) => s.error);
  return (
    <div className="auth-banner" role="status">
      <span className="auth-banner-text">{error ?? "Your session has ended. Sign in again to keep generating."}</span>
      <GoogleSignInButton options={{ theme: "outline", size: "medium", text: "signin", shape: "pill" }} />
    </div>
  );
}

"use client";

import { GOOGLE_CLIENT_ID } from "../googleIdentity";
import { checkSession } from "../session";
import { useIdentityStore } from "../useIdentity";
import GoogleSignInButton from "./GoogleSignInButton";

/** Before the board, when sign-in is required and no session holds (#321). */
export default function SignInScreen() {
  const status = useIdentityStore((s) => s.status);
  const error = useIdentityStore((s) => s.error);

  return (
    <main className="auth-screen">
      <div className="auth-card">
        <h1 className="auth-title">GCOS Personalization</h1>
        {status === "unreachable" ? (
          <>
            <p className="auth-text">We couldn&apos;t reach the server to check your sign-in.</p>
            <button type="button" className="auth-button" onClick={() => void checkSession()}>
              Try again
            </button>
          </>
        ) : !GOOGLE_CLIENT_ID ? (
          // A deploy without NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID: say so,
          // rather than a Google button that fails inside its popup.
          <p className="auth-text" role="alert">
            Sign-in isn&apos;t set up for this site yet (no Google client id).
          </p>
        ) : (
          <>
            <p className="auth-text">Sign in with your work Google account to open your board.</p>
            <GoogleSignInButton options={{ theme: "outline", size: "large", text: "signin_with", shape: "pill", width: 280 }} />
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}

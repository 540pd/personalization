// The sign-in lifecycle (#321): check on load, sign in, sign out, expiry.
// The only writer of the identity store.

import { setIdToken, onSessionExpired } from "./authState";
import { endSession, fetchAuthMode, fetchSessionEmail, startSession } from "./authApi";
import { emailOfIdToken, forgetGoogleAccount } from "./googleIdentity";
import { identityOf, useIdentityStore, type Identity } from "./useIdentity";

/**
 * The stand-in identity for anonymous mode, so the rail's account menu can be
 * used in local dev. NEXT_PUBLIC_* values are inlined at build time, so the
 * NODE_ENV check keeps a deploy config from shipping a user who does not exist.
 */
function devIdentity(): Identity | null {
  if (process.env.NODE_ENV === "production") return null;
  return {
    name: process.env.NEXT_PUBLIC_DEV_USER_NAME || "Abhimanyu Mahato",
    email: process.env.NEXT_PUBLIC_DEV_USER_EMAIL || "abhimanyu.mahato@accenture.com",
  };
}

const set = useIdentityStore.setState;

/** On load: which mode, then whether the session cookie still holds. */
export async function checkSession(): Promise<void> {
  set({ status: "checking" });
  const mode = await fetchAuthMode();
  if (mode === null) {
    // The gate is not the security boundary -- the backend refuses every
    // gated call on its own -- so a dev build without a backend still opens
    // the board, as it always has. A deployed one says what is wrong.
    if (process.env.NODE_ENV === "production") set({ status: "unreachable" });
    else set({ status: "anonymous", identity: devIdentity() });
    return;
  }
  if (mode === "anonymous") {
    set({ status: "anonymous", identity: devIdentity() });
    return;
  }
  try {
    const email = await fetchSessionEmail();
    set(email ? { status: "signedIn", identity: identityOf(email), expired: false } : { status: "signedOut", identity: null });
  } catch {
    set({ status: "unreachable" });
  }
}

const REFUSED: Record<string, string> = {
  domain_not_allowed: "isn't allowed here. Sign in with your work Google account.",
  token_expired: "Google's sign-in expired before it reached us. Try again.",
  unreachable: "We couldn't reach the server. Check your connection and try again.",
};

/** A credential from the Google button: the session cookie, then the board. */
export async function completeSignIn(idToken: string): Promise<void> {
  setIdToken(idToken);
  set({ error: null });
  const result = await startSession(idToken);
  if (!result.ok) {
    setIdToken(null);
    const email = emailOfIdToken(idToken);
    const reason = REFUSED[result.error] ?? "Sign-in didn't work. Try again.";
    set({ error: result.error === "domain_not_allowed" && email ? `${email} ${reason}` : reason });
    return;
  }
  // With the cookie set, it is the credential: the ID token lasts an hour,
  // and sent alongside it would win and then expire mid-session. Without a
  // cookie (no SESSION_SECRET) the token is all there is.
  if (result.cookie) setIdToken(null);
  const email = (result.cookie ? await fetchSessionEmail().catch(() => null) : null) ?? emailOfIdToken(idToken);
  set({ status: "signedIn", identity: email ? identityOf(email) : null, expired: false, error: null });
}

/** Back to the sign-in screen. The board in this browser is left as it is. */
export async function signOut(): Promise<void> {
  if (useIdentityStore.getState().status === "anonymous") {
    // Nothing to sign out of: only the rail's stand-in identity goes.
    set({ identity: null });
    return;
  }
  setIdToken(null);
  forgetGoogleAccount();
  set({ status: "signedOut", identity: null, expired: false, error: null });
  await endSession();
}

// A request answered that the session ended: say so over the board, which
// stays as it is, rather than unmounting it to show the sign-in screen.
onSessionExpired(() => {
  if (useIdentityStore.getState().status === "signedIn") set({ expired: true });
});

// Google Identity Services (GIS): the "Sign in with Google" button (#321).
//
// The script is loaded on first use, so it only ever loads where sign-in is
// required: anonymous mode never renders a button. GIS is initialised once
// per page -- it warns on a second initialize() -- and its one callback hands
// the credential to whichever button asked last.

const GIS_SRC = "https://accounts.google.com/gsi/client";

/** Public by design: Google client ids are not secrets. Inlined at build. */
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID ?? "";

export interface GoogleButtonOptions {
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  text?: "signin_with" | "continue_with" | "signin";
  shape?: "pill" | "rectangular";
  width?: number;
}

interface GoogleAccountsId {
  initialize(config: { client_id: string; callback: (r: { credential: string }) => void; auto_select?: boolean }): void;
  renderButton(parent: HTMLElement, options: GoogleButtonOptions): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

let loading: Promise<GoogleAccountsId> | null = null;
let onCredential: ((idToken: string) => void) | null = null;

/** GIS, initialised; rejects when the script cannot load (offline, blocked). */
export function loadGoogleIdentity(): Promise<GoogleAccountsId> {
  loading ??= new Promise<GoogleAccountsId>((resolve, reject) => {
    const ready = () => {
      const id = window.google?.accounts?.id;
      if (!id) return reject(new Error("Google sign-in did not load."));
      id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => onCredential?.(r.credential) });
      resolve(id);
    };
    if (window.google?.accounts?.id) return ready();
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.onload = ready;
    script.onerror = () => reject(new Error("Google sign-in could not be reached."));
    document.head.appendChild(script);
  }).catch((err) => {
    // Not cached as failed: Retry loads it again.
    loading = null;
    document.querySelector(`script[src="${GIS_SRC}"]`)?.remove();
    throw err;
  });
  return loading;
}

/** Renders the button into `parent`; its credential goes to `handler`. */
export async function renderGoogleButton(
  parent: HTMLElement,
  handler: (idToken: string) => void,
  options: GoogleButtonOptions,
): Promise<void> {
  const id = await loadGoogleIdentity();
  onCredential = handler;
  id.renderButton(parent, options);
}

/** After sign-out: no silent re-selection of the same account. */
export function forgetGoogleAccount(): void {
  if (typeof window !== "undefined") window.google?.accounts?.id?.disableAutoSelect();
}

/**
 * The email in an ID token's payload, unverified: for the error message when
 * the backend refuses the account. Identity itself always comes from the
 * backend, which verifies the token.
 */
export function emailOfIdToken(idToken: string): string | null {
  try {
    const payload = idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const { email } = JSON.parse(atob(payload)) as { email?: unknown };
    return typeof email === "string" ? email : null;
  } catch {
    return null;
  }
}

"use client";

import { useState, type FormEvent } from "react";
import { completeDevSignIn } from "../session";

/** Who dev sign-in suggests: an allowed address, so Continue just works. */
export const DEV_EMAIL = "dev.user@accenture.com";

/**
 * The dev sign-in placeholder's form (#334), where Google's button would
 * be: the email typed is who you are. Only shown when the backend runs
 * AUTH_MODE=dev, which a deployed backend refuses.
 */
export default function DevSignInForm({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState(DEV_EMAIL);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await completeDevSignIn(email);
    setBusy(false);
  }

  return (
    <form className={compact ? "auth-dev auth-dev-compact" : "auth-dev"} onSubmit={submit}>
      <label className="auth-dev-field">
        <span className={compact ? "sr-only" : "auth-dev-label"}>Email</span>
        <input
          type="email"
          className="auth-dev-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </label>
      <button type="submit" className="auth-button" disabled={busy}>
        {busy ? "Signing in…" : "Continue"}
      </button>
      {!compact && <p className="auth-dev-note">Dev sign-in — a placeholder for Google, not for production.</p>}
    </form>
  );
}

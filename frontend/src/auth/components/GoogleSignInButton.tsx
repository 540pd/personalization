"use client";

import { useEffect, useRef, useState } from "react";
import { renderGoogleButton, type GoogleButtonOptions } from "../googleIdentity";
import { completeSignIn } from "../session";

/**
 * Google's own button (GIS renders it into an iframe; its look is Google's
 * to set). Loading the script is the only state of ours: a placeholder of
 * the button's size until then, and Retry if it cannot load.
 */
export default function GoogleSignInButton({ options }: { options: GoogleButtonOptions }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setState("loading");
    renderGoogleButton(ref.current!, (token) => void completeSignIn(token), options)
      .then(() => live && setState("ready"))
      .catch(() => live && setState("failed"));
    return () => {
      live = false;
    };
    // options is a literal at each call site; re-rendering the button for a
    // new object identity would flicker it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  return (
    <div className="auth-google" data-state={state}>
      <div ref={ref} className="auth-google-slot" aria-busy={state === "loading"} />
      {state === "failed" && (
        <p className="auth-google-failed" role="alert">
          Google sign-in couldn&apos;t load.{" "}
          <button type="button" className="auth-link" onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </button>
        </p>
      )}
    </div>
  );
}

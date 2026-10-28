"use client";

import { useIdentityStore } from "../useIdentity";
import DevSignInForm from "./DevSignInForm";
import GoogleSignInButton from "./GoogleSignInButton";

/** Google's button, or the dev placeholder's form: whichever the backend
 * runs (#321, #334). The rest of sign-in is the same either way. */
export default function SignInControl({ compact = false }: { compact?: boolean }) {
  const mode = useIdentityStore((s) => s.mode);
  if (mode === "dev") return <DevSignInForm compact={compact} />;
  return compact ? (
    <GoogleSignInButton options={{ theme: "outline", size: "medium", text: "signin", shape: "pill" }} />
  ) : (
    <GoogleSignInButton options={{ theme: "outline", size: "large", text: "signin_with", shape: "pill", width: 280 }} />
  );
}

"use client";

import type { ReactNode } from "react";
import { useAuth } from "./AuthProvider";

export default function AuthGate({ children }: { children: ReactNode }) {
  const { authenticated, signIn } = useAuth();

  if (!authenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-950 text-white">
        <h1 className="text-xl font-semibold mb-4">GCOS Personalization</h1>
        <button
          onClick={signIn}
          className="px-6 py-2 rounded-full bg-white text-neutral-900 font-medium hover:bg-neutral-200 transition-colors"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  return <>{children}</>;
}

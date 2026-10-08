"use client";

import { create } from "zustand";

/**
 * Who is signed in.
 *
 * The single seam between the app and whatever establishes identity. Today
 * nothing does -- the backend boots in anonymous mode locally, and the
 * deployed gate (IAP) is specced but not built -- so the only source is the
 * development stub below.
 *
 * It exists now rather than later because the sidebar already took a `user`
 * prop that nothing passed: an abstraction with no producer, which looks
 * wired until you try to use it. When the IAP work lands it fills `identity`
 * from the verified assertion and this file is the only thing that changes.
 */

export interface Identity {
  name: string;
  email: string;
}

/**
 * A fake identity must never be able to reach a deployed build.
 *
 * NEXT_PUBLIC_* values are inlined at BUILD time, so gating on the env var
 * alone would let someone set it in a deploy config and ship a signed-in
 * user who does not exist. The NODE_ENV check is the belt to that braces.
 */
const IS_DEV = process.env.NODE_ENV !== "production";

function devIdentity(): Identity | null {
  if (!IS_DEV) return null;
  // Works with no configuration -- the point is to be able to click the
  // thing -- but overridable to try a different name, or a long address
  // against the menu's truncation.
  return {
    name: process.env.NEXT_PUBLIC_DEV_USER_NAME || "Abhimanyu Mahato",
    email: process.env.NEXT_PUBLIC_DEV_USER_EMAIL || "abhimanyu.mahato@accenture.com",
  };
}

interface IdentityState {
  identity: Identity | null;
  /** Local only: lets the signed-out state be seen without a restart. */
  signOut: () => void;
  restore: () => void;
}

export const useIdentityStore = create<IdentityState>((set) => ({
  identity: devIdentity(),
  signOut: () => set({ identity: null }),
  restore: () => set({ identity: devIdentity() }),
}));

export function useIdentity(): Identity | null {
  return useIdentityStore((s) => s.identity);
}

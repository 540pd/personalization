"use client";

// Leaving a page with unsaved changes asks first (#219), the same way on
// Brand and Assets (#462). Every way out -- the rail, the user menu, ⌘, --
// goes through the section store's leave guard; a reload or closed tab gets
// the browser's own prompt.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { setLeaveGuard } from "@/store/section.store";
import { listen } from "@/lib/dom/listen";
import { DiscardChanges } from "./LibraryDialog";

export interface LeaveGuardOptions {
  /** What the confirm calls the changes: "Your changes to {name} won't be saved." */
  name: string;
  /** Runs on Discard, before the move: clean-up of what no save attached. */
  onDiscard?: () => void;
}

/** Guards the page while `dirty`; returns the confirm to render, or null. */
export function useLeaveGuard(dirty: boolean, { name, onDiscard }: LeaveGuardOptions): ReactNode {
  // The move a Discard would make, while the confirm is up.
  const [pending, setPending] = useState<(() => void) | null>(null);
  // Where focus was when the confirm opened, for Keep editing.
  const beforeConfirm = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!dirty) return;
    setLeaveGuard((proceed) => {
      beforeConfirm.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPending(() => proceed);
      return true;
    });
    const stopUnload = listen(window, "beforeunload", (e) => e.preventDefault());
    return () => {
      setLeaveGuard(null);
      stopUnload();
    };
  }, [dirty]);

  if (!pending) return null;

  const keepEditing = () => {
    setPending(null);
    requestAnimationFrame(() => beforeConfirm.current?.focus());
  };

  const discard = () => {
    setPending(null);
    // Unguarded first, so the move is not asked about a second time.
    setLeaveGuard(null);
    onDiscard?.();
    pending();
  };

  return <DiscardChanges name={name} onKeepEditing={keepEditing} onDiscard={discard} />;
}

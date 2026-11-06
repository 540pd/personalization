"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { modalKeys } from "@/components/Modal/modalKeys";
import SupportForm from "./SupportForm";
import type { SupportContext, SupportReply } from "../support.api";

const FOCUSABLE = "button:not(:disabled), input:not(:disabled):not([tabindex='-1']), textarea:not(:disabled), a[href]";

/**
 * Support over the board (#428), from the rail's Support. Closes with
 * Escape or ×; a click outside does nothing, so a stray click never closes
 * it mid-message (the draft would be kept anyway). Tab stays inside.
 */
export default function SupportDialog({
  onClose,
  context,
  send,
}: {
  onClose: () => void;
  context: () => SupportContext;
  send: (context: SupportContext, website: string) => Promise<SupportReply | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const keys = modalKeys(ref, onClose, FOCUSABLE);

  // Escape closes it wherever focus is: a disabled Contact us, while
  // sending, drops focus to the page, out of reach of the dialog's own keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !ref.current?.contains(document.activeElement)) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    // A press outside keeps focus where it was, in the form, and closes nothing.
    <div className="dialog-backdrop support-dialog" onMouseDown={(e) => e.target === e.currentTarget && e.preventDefault()}>
      {/* aria-modal: the board's capture-phase Delete handlers skip events from inside a modal. */}
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Support" onKeyDown={keys.onKeyDown}>
        <SupportForm context={context} onClose={onClose} send={send} />
      </div>
    </div>,
    document.body,
  );
}

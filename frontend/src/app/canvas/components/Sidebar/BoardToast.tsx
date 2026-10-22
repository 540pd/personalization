"use client";

import { createPortal } from "react-dom";
import { AlertCircle, Check } from "lucide-react";

/**
 * The board actions' confirmations: "Board cleared · Undo", "Board saved to
 * file", and their failures. Same pill as "Brand saved"; an Undo is the
 * shared timeline's undo, exactly what Ctrl+Z does.
 */
export default function BoardToast({
  message,
  error = false,
  onUndo,
}: {
  message: string;
  error?: boolean;
  onUndo?: () => void;
}) {
  return createPortal(
    // alert for a failure, so a screen reader interrupts with it.
    <div className="board-toast" role={error ? "alert" : "status"}>
      {error ? (
        <AlertCircle size={16} className="board-toast-error-icon" aria-hidden />
      ) : (
        <Check size={16} aria-hidden />
      )}
      {message}
      {onUndo && (
        <>
          <span className="board-toast-sep" aria-hidden />
          <button type="button" className="board-toast-action" onClick={onUndo}>
            Undo
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}

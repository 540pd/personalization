"use client";

import { createPortal } from "react-dom";
import { Check } from "lucide-react";

/**
 * The confirmation after Clear, with the way back. Same pill as "Brand
 * saved"; Undo is the shared timeline's undo, exactly what Ctrl+Z does.
 */
export default function BoardClearedToast({ onUndo }: { onUndo: () => void }) {
  return createPortal(
    <div className="board-toast" role="status">
      <Check size={16} aria-hidden />
      Board cleared
      <span className="board-toast-sep" aria-hidden />
      <button type="button" className="board-toast-action" onClick={onUndo}>
        Undo
      </button>
    </div>,
    document.body,
  );
}

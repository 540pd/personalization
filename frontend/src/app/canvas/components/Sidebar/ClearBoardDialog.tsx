"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * "Clear board?" (#197). Styled as Brand's discard prompt, which is the one
 * confirm the app already has.
 *
 * Cancel takes focus, so Enter on an unread dialog keeps the board.
 * aria-modal is load-bearing as well as correct: the capture-phase Delete
 * handlers (NodePanel, ConnectionOverlay) skip events from inside a modal.
 */
export default function ClearBoardDialog({
  count,
  onCancel,
  onConfirm,
}: {
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Board's window listeners would otherwise see Backspace and Ctrl+Z.
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key !== "Tab") return;
    const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button") ?? []);
    if (!buttons.length) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className="clear-board-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="clear-board-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-desc`}
        onKeyDown={onKeyDown}
      >
        <h3 id={`${id}-title`} className="clear-board-title">
          Clear board?
        </h3>
        <p id={`${id}-desc`} className="clear-board-text">
          This removes all {count === 1 ? "1 item" : `${count} items`} from PlaySpace.
        </p>
        <div className="clear-board-actions">
          <button ref={cancelRef} type="button" className="clear-board-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="clear-board-confirm" onClick={onConfirm}>
            Clear
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

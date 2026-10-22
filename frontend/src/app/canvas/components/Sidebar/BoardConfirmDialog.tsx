"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * The confirms in front of the board actions -- "Clear board?" (#197) and
 * "Replace current board?" (#199). Styled as Brand's discard prompt, the one
 * confirm the app had.
 *
 * Cancel takes focus, so Enter on an unread dialog keeps the board.
 * aria-modal is load-bearing as well as correct: the capture-phase Delete
 * handlers (NodePanel, ConnectionOverlay) skip events from inside a modal.
 */
export default function BoardConfirmDialog({
  title,
  children,
  confirmLabel,
  tone,
  onCancel,
  onConfirm,
  onSaveFirst,
  secondary,
}: {
  title: string;
  /** The one-line description under the title. */
  children: ReactNode;
  confirmLabel: string;
  /** danger (red) only for what cannot be had back without Undo; primary (black) otherwise. */
  tone: "danger" | "primary";
  onCancel: () => void;
  onConfirm: () => void;
  /** When given, a "Save to file first" link that saves and leaves the dialog open. */
  onSaveFirst?: () => void;
  /**
   * When given, takes the Cancel button's place (and its focus) -- for a
   * confirm whose other answer is an action too, like Keep both (#206).
   * Escape and the backdrop still cancel.
   */
  secondary?: { label: string; onClick: () => void };
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
      className="board-confirm-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="board-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-desc`}
        onKeyDown={onKeyDown}
      >
        <h3 id={`${id}-title`} className="board-confirm-title">
          {title}
        </h3>
        <p id={`${id}-desc`} className="board-confirm-text">
          {children}
        </p>
        <div className="board-confirm-actions">
          {onSaveFirst && (
            <button type="button" className="board-confirm-save" onClick={onSaveFirst}>
              Save to file first
            </button>
          )}
          <button
            ref={cancelRef}
            type="button"
            className="board-confirm-cancel"
            onClick={secondary?.onClick ?? onCancel}
          >
            {secondary?.label ?? "Cancel"}
          </button>
          <button
            type="button"
            className={tone === "danger" ? "board-confirm-danger" : "board-confirm-primary"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

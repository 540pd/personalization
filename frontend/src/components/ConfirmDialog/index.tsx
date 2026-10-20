"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { modalKeys } from "../Modal/modalKeys";

/**
 * The confirms in front of the board actions -- "Clear board?" (#197) and
 * "Replace current board?" (#199) -- and the library's: Remove… (#211),
 * Replace or Keep both (#206), Discard changes (#210). Styled as Brand's
 * discard prompt, the one confirm the app had.
 *
 * Cancel takes focus, so Enter on an unread dialog keeps the board.
 * aria-modal is load-bearing as well as correct: the capture-phase Delete
 * handlers (NodePanel, ConnectionOverlay) skip events from inside a modal.
 */
export default function ConfirmDialog({
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
  const keys = modalKeys(dialogRef, onCancel);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return createPortal(
    <div className="board-confirm-backdrop" onMouseDown={keys.onBackdropMouseDown}>
      <div
        ref={dialogRef}
        className="board-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-desc`}
        onKeyDown={keys.onKeyDown}
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

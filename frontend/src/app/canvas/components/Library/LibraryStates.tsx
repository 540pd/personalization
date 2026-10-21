"use client";

// What a library page shows besides its table: the primary action, the
// empty state before anything is added, and the "no match" state of a
// filter that hides every row.

import type { ReactNode, RefObject } from "react";

/** The header's (or the empty state's) primary button. */
export function LibraryAction({
  label,
  icon,
  onClick,
  buttonRef,
  inEmpty = false,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  buttonRef: RefObject<HTMLButtonElement | null>;
  inEmpty?: boolean;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={inEmpty ? "library-action-button library-empty-button" : "library-action-button"}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

export function LibraryEmpty({
  icon,
  title,
  text,
  action,
  hint,
  footer,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action: ReactNode;
  hint?: string;
  /** In place of `hint`, when the line under the button holds a control. */
  footer?: ReactNode;
}) {
  return (
    <div className="library-empty">
      <span className="library-empty-icon" aria-hidden>
        {icon}
      </span>
      <p className="library-empty-title">{title}</p>
      <p className="library-empty-text">{text}</p>
      {action}
      {footer ?? (hint && <p className="library-empty-hint">{hint}</p>)}
    </div>
  );
}

export function LibraryNoMatch({ noun, onClear }: { noun: string; onClear: () => void }) {
  return (
    <div className="library-no-match">
      <p>No {noun} match</p>
      <button type="button" className="board-confirm-cancel" onClick={onClear}>
        Clear filters
      </button>
    </div>
  );
}

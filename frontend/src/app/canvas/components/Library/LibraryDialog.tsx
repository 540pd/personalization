"use client";

import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import BoardConfirmDialog from "../Sidebar/BoardConfirmDialog";

const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

/**
 * The frame of a library's form -- Upload skill (#206), New agent (#208):
 * backdrop, title, close, focus kept inside, Esc and the backdrop asking to
 * close. Key events stop here, so neither the page behind nor the board's
 * window listeners see them; dropped files go to `onFileDrop` or nowhere.
 */
export default function LibraryDialog({
  title,
  subtitle,
  onRequestClose,
  onFileDrop,
  children,
  after,
}: {
  title: string;
  subtitle: string;
  /** Esc, ×, or the backdrop. The form decides whether that closes it. */
  onRequestClose: () => void;
  onFileDrop?: (file: File) => void;
  children: (titleId: string) => ReactNode;
  /** Rendered over the dialog: its confirms. */
  after?: ReactNode;
}) {
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      onRequestClose();
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not([readonly]), textarea, [tabindex='0']",
      ) ?? [],
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
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
      className="library-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onRequestClose();
      }}
      onDragOver={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = onFileDrop ? "copy" : "none";
      }}
      onDrop={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        const dropped = e.dataTransfer.files[0];
        if (dropped && onFileDrop) onFileDrop(dropped);
      }}
    >
      <div
        ref={dialogRef}
        className="library-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onKeyDown={onKeyDown}
      >
        <div className="library-dialog-header">
          <div>
            <h2 id={`${id}-title`} className="library-dialog-title">
              {title}
            </h2>
            <p className="library-dialog-subtitle">{subtitle}</p>
          </div>
          <button type="button" className="library-dialog-close" aria-label="Close" onClick={onRequestClose}>
            <X size={15} aria-hidden />
          </button>
        </div>
        {children(id)}
      </div>
      {after}
    </div>,
    document.body,
  );
}

/** A fresh file input per pick, as Open file does: one kept in the page would make "the file input" ambiguous. */
export function pickMarkdownFile(onPicked: (file: File) => void): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".md,.markdown,text/markdown";
  input.addEventListener("change", () => {
    const picked = input.files?.[0];
    if (picked) onPicked(picked);
  });
  input.click();
}

/** Under Name: an error if there is one, else a hint (possibly empty). */
export function NameNote({ id, error, hint }: { id: string; error: string | null; hint: string }) {
  return (
    <p id={id} className={error ? "library-field-error" : "library-field-hint"}>
      {error ?? hint}
    </p>
  );
}

/** "Discard changes?" in front of an edit form (#210). */
export function DiscardChanges({
  name,
  onKeepEditing,
  onDiscard,
}: {
  name: string;
  onKeepEditing: () => void;
  onDiscard: () => void;
}) {
  return (
    <BoardConfirmDialog
      title="Discard changes?"
      confirmLabel="Discard"
      tone="danger"
      onCancel={onKeepEditing}
      onConfirm={onDiscard}
      secondary={{ label: "Keep editing", onClick: onKeepEditing }}
    >
      Your changes to {name} won&apos;t be saved.
    </BoardConfirmDialog>
  );
}

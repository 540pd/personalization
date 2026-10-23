"use client";

import type { ReactNode } from "react";
import BoardConfirmDialog from "../Sidebar/BoardConfirmDialog";
import LibraryDialog, { DiscardChanges, NameNote } from "./LibraryDialog";
import type { LibraryItemForm } from "./useLibraryItemForm";
import { HANDLE_HINT, MAX_DESCRIPTION, MAX_NAME, toHandle } from "../../library/fields";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A library item's Upload / Edit dialog around its form (#206, #208, #210),
 * with the confirms over it: Replace or Keep both for a name already taken,
 * and Discard changes for a closed edit.
 */
export function LibraryItemDialog({
  form,
  title,
  subtitle,
  children,
}: {
  form: LibraryItemForm;
  title: string;
  subtitle: string;
  /** The form's fields, given the dialog's id prefix. */
  children: (id: string) => ReactNode;
}) {
  const { confirm, editing } = form;
  const confirmDialog =
    confirm?.kind === "duplicate" ? (
      <BoardConfirmDialog
        title={`Replace “${confirm.existing.name}”?`}
        confirmLabel="Replace"
        tone="primary"
        onCancel={form.cancelConfirm}
        onConfirm={() => form.save("replace")}
        secondary={{ label: "Keep both", onClick: () => form.save("keep") }}
      >
        {capitalize(form.noun.a)} with this name already exists. Replacing it swaps in this file, description and tags.
      </BoardConfirmDialog>
    ) : confirm?.kind === "discard" && editing ? (
      <DiscardChanges name={editing.name} onKeepEditing={form.cancelConfirm} onDiscard={form.onClose} />
    ) : null;

  return (
    <LibraryDialog
      title={title}
      subtitle={subtitle}
      onRequestClose={form.requestClose}
      onFileDrop={(dropped) => void form.chooseFile(dropped)}
      after={confirmDialog}
    >
      {(id) => (
        <form
          className="library-dialog-body"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            form.submit();
          }}
        >
          {children(id)}
        </form>
      )}
    </LibraryDialog>
  );
}

export function NameField({
  id,
  form,
  placeholder,
  replacedFileHint,
}: {
  id: string;
  form: LibraryItemForm;
  placeholder: string;
  /** Editing, the hint once Replace file… has picked a new file. */
  replacedFileHint?: string;
}) {
  const { editing, existing, errors, touched } = form;
  return (
    <div>
      <label htmlFor={`${id}-name`} className="library-field-label">
        Name
      </label>
      <input
        ref={form.nameRef}
        id={`${id}-name`}
        type="text"
        className="library-input"
        placeholder={placeholder}
        maxLength={MAX_NAME}
        value={form.name}
        onChange={(e) => form.setName(toHandle(e.target.value, true))}
        onBlur={() => form.setTouched((t) => ({ ...t, name: true }))}
        aria-invalid={(touched.name || !!editing) && !!errors.name}
        aria-describedby={`${id}-name-note`}
      />
      <NameNote
        id={`${id}-name-note`}
        // A taken name shows at once while editing: it is why Save is off.
        error={touched.name || editing ? errors.name : null}
        hint={
          editing
            ? (form.fileChanged && replacedFileHint) || HANDLE_HINT
            : existing
              ? `You already have “${existing.name}”. You'll be asked to replace it or keep both.`
              : HANDLE_HINT
        }
      />
    </div>
  );
}

export function DescriptionField({
  id,
  form,
  placeholder,
  multiline = false,
}: {
  id: string;
  form: LibraryItemForm;
  placeholder: string;
  /** A two-row textarea rather than a one-line input. */
  multiline?: boolean;
}) {
  const { description, errors, touched } = form;
  const props = {
    id: `${id}-description`,
    placeholder,
    maxLength: MAX_DESCRIPTION,
    value: description,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => form.setDescription(e.target.value),
    onBlur: () => form.setTouched((t) => ({ ...t, description: true })),
    "aria-invalid": touched.description && !!errors.description,
    "aria-describedby": `${id}-description-note`,
  };
  return (
    <div>
      <div className="library-field-label-row">
        <label htmlFor={`${id}-description`} className="library-field-label">
          Description
        </label>
        <span className="library-field-count" aria-hidden>
          {description.length} / {MAX_DESCRIPTION}
        </span>
      </div>
      {multiline ? (
        <textarea className="library-input library-textarea" rows={2} {...props} />
      ) : (
        <input type="text" className="library-input" {...props} />
      )}
      <p id={`${id}-description-note`} className="library-field-error">
        {touched.description ? errors.description : ""}
      </p>
    </div>
  );
}

/** Cancel and Upload / Save changes, after anything the dialog adds first. */
export function DialogActions({ form, children }: { form: LibraryItemForm; children?: ReactNode }) {
  return (
    <div className="library-dialog-actions">
      {children}
      <button type="button" className="board-confirm-cancel" onClick={form.requestClose}>
        Cancel
      </button>
      <button ref={form.submitRef} type="submit" className="library-dialog-submit" disabled={!form.canSave}>
        {form.editing ? "Save changes" : "Upload"}
      </button>
    </div>
  );
}

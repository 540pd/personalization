"use client";

import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { useSkills } from "@/store/skills.store";
import BoardConfirmDialog from "../Sidebar/BoardConfirmDialog";
import LibraryDialog, { DiscardChanges, NameNote, pickMarkdownFile } from "../Library/LibraryDialog";
import FileField, { readPickedFile, type ChosenFile } from "../Library/FileField";
import TagInput from "../Library/TagInput";
import {
  HANDLE_HINT,
  MAX_DESCRIPTION,
  MAX_NAME,
  allTags,
  descriptionError,
  findByName,
  nameError,
  newId,
  sameList,
  toHandle,
  uniqueName,
} from "../../library/fields";
import { metaFromFile, type Skill } from "../../skills/skillFile";

/** How the skill was saved, for the toast. */
export type SkillSaved = "added" | "replaced" | "saved";

type Confirm = { kind: "duplicate"; existing: Skill } | { kind: "discard" };

/**
 * Upload skill (#206), and Edit skill (#210) when given `editing`.
 *
 * Upload: the file comes first because it can fill in the rest. Edit: the
 * skill's own file is shown, Replace file… swaps it on save, and nothing is
 * re-filled from the new file -- the name, description and tags are the
 * user's by now.
 */
export default function UploadSkillDialog({
  editing,
  initialFile,
  onClose,
  onSaved,
  onSaveFailed,
}: {
  /** The skill being edited; without it the dialog uploads a new one. */
  editing?: Skill;
  /** A file dropped on the page, already chosen when the dialog opens. */
  initialFile?: File;
  onClose: () => void;
  /** After the skill is saved; the dialog is then closed by the parent. */
  onSaved: (name: string, how: SkillSaved) => void;
  /** The save was refused by storage; the dialog stays open. */
  onSaveFailed: () => void;
}) {
  const skills = useSkills((s) => s.skills);
  const add = useSkills((s) => s.add);
  const replace = useSkills((s) => s.replace);

  const [file, setFile] = useState<ChosenFile | null>(
    editing ? { name: editing.fileName, size: editing.size, content: editing.content } : null,
  );
  const [fileChanged, setFileChanged] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [tags, setTags] = useState<string[]>(editing?.tags ?? []);
  const [touched, setTouched] = useState({ name: false, description: false });
  const [confirm, setConfirmState] = useState<Confirm | null>(null);

  const dropRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  // Read when a file arrives, which is after the click that asked for it.
  const fieldsRef = useRef({ name, description, tags });
  fieldsRef.current = { name, description, tags };
  // Where focus was when a confirm opened, so cancelling it puts focus back.
  const returnFocus = useRef<HTMLElement | null>(null);
  const setConfirm = (next: Confirm) => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setConfirmState(next);
  };
  const cancelConfirm = () => {
    setConfirmState(null);
    requestAnimationFrame(() => (returnFocus.current?.isConnected ? returnFocus.current : submitRef.current)?.focus());
  };

  const chooseFile = async (picked: File) => {
    const read = await readPickedFile(picked, { tag: "[skills]" });
    if (!read.ok) {
      // Editing, the skill keeps its own file: only the new one is refused.
      if (!editing) setFile(null);
      setFileError(read.error);
      return;
    }
    setFile(read.file);
    setFileChanged(true);
    setFileError(null);
    if (editing) return;
    // Fill in only what the user has not entered yet.
    const meta = metaFromFile(read.file.content, read.file.name);
    if (!fieldsRef.current.name.trim()) setName(meta.name);
    if (!fieldsRef.current.description.trim()) setDescription(meta.description);
    if (!fieldsRef.current.tags.length) setTags(meta.tags);
    nameRef.current?.focus();
  };

  useEffect(() => {
    if (initialFile) void chooseFile(initialFile);
    else if (editing) nameRef.current?.focus();
    else dropRef.current?.focus();
    // Once, for the file the dialog was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Editing, a name another skill has is an error; uploading, it asks Replace or Keep both.
  const existing = findByName(editing ? skills.filter((s) => s.id !== editing.id) : skills, name);
  const errors = {
    name: nameError(name) ?? (editing && existing ? `You already have a skill called “${existing.name}”` : null),
    description: descriptionError(description),
  };
  const dirty = editing
    ? fileChanged ||
      toHandle(name) !== editing.name ||
      description.trim() !== editing.description ||
      !sameList(tags, editing.tags)
    : false;
  const canSave = !!file && !errors.name && !errors.description && (!editing || dirty);

  const requestClose = () => {
    if (dirty) setConfirm({ kind: "discard" });
    else onClose();
  };

  const save = (mode: "new" | "replace" | "keep") => {
    if (!file) return;
    const fields = {
      description: description.trim(),
      tags,
      fileName: file.name,
      size: file.size,
      content: file.content,
    };
    let saved: boolean;
    let finalName = toHandle(name);
    let how: SkillSaved = "added";
    if (editing) {
      saved = replace({ ...editing, ...fields, name: finalName });
      how = "saved";
    } else if (mode === "replace" && confirm?.kind === "duplicate") {
      finalName = confirm.existing.name;
      saved = replace({ ...confirm.existing, ...fields });
      how = "replaced";
    } else {
      if (mode === "keep") finalName = uniqueName(skills, finalName);
      saved = add({ id: newId("skill"), name: finalName, createdAt: Date.now(), ...fields });
    }
    setConfirmState(null);
    if (saved) onSaved(finalName, how);
    else onSaveFailed();
  };

  const submit = () => {
    if (!canSave) return;
    if (!editing && existing) setConfirm({ kind: "duplicate", existing });
    else save("new");
  };

  const confirmDialog =
    confirm?.kind === "duplicate" ? (
      <BoardConfirmDialog
        title={`Replace “${confirm.existing.name}”?`}
        confirmLabel="Replace"
        tone="primary"
        onCancel={cancelConfirm}
        onConfirm={() => save("replace")}
        secondary={{ label: "Keep both", onClick: () => save("keep") }}
      >
        A skill with this name already exists. Replacing it swaps in this file, description and tags.
      </BoardConfirmDialog>
    ) : confirm?.kind === "discard" && editing ? (
      <DiscardChanges name={editing.name} onKeepEditing={cancelConfirm} onDiscard={onClose} />
    ) : null;

  return (
    <LibraryDialog
      title={editing ? "Edit skill" : "Upload skill"}
      subtitle={editing ? "Agents using it pick up the change." : "Choose a markdown file, then describe it."}
      onRequestClose={requestClose}
      onFileDrop={(dropped) => void chooseFile(dropped)}
      after={confirmDialog}
    >
      {(id) => (
        <form
          className="library-dialog-body"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <FileField
            id={id}
            file={file}
            icon={<FileText size={17} />}
            meta={editing && fileChanged ? `replaces ${editing.fileName} when you save` : undefined}
            changeLabel={editing ? "Replace file…" : "Change"}
            error={fileError}
            onPick={() => pickMarkdownFile((f) => void chooseFile(f))}
            dropRef={dropRef}
          />

          <div>
            <label htmlFor={`${id}-name`} className="library-field-label">
              Name
            </label>
            <input
              ref={nameRef}
              id={`${id}-name`}
              type="text"
              className="library-input"
              placeholder="e.g. brand-voice"
              maxLength={MAX_NAME}
              value={name}
              onChange={(e) => setName(toHandle(e.target.value, true))}
              onBlur={() => setTouched((t) => ({ ...t, name: true }))}
              aria-invalid={(touched.name || !!editing) && !!errors.name}
              aria-describedby={`${id}-name-note`}
            />
            <NameNote
              id={`${id}-name-note`}
              // A taken name shows at once while editing: it is why Save is off.
              error={touched.name || editing ? errors.name : null}
              hint={!editing && existing ? `You already have “${existing.name}”. You'll be asked to replace it or keep both.` : HANDLE_HINT}
            />
          </div>

          <div>
            <div className="library-field-label-row">
              <label htmlFor={`${id}-description`} className="library-field-label">
                Description
              </label>
              <span className="library-field-count" aria-hidden>
                {description.length} / {MAX_DESCRIPTION}
              </span>
            </div>
            <textarea
              id={`${id}-description`}
              className="library-input library-textarea"
              rows={2}
              placeholder="What this skill does, in one line"
              maxLength={MAX_DESCRIPTION}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, description: true }))}
              aria-invalid={touched.description && !!errors.description}
              aria-describedby={`${id}-description-note`}
            />
            <p id={`${id}-description-note`} className="library-field-error">
              {touched.description ? errors.description : ""}
            </p>
          </div>

          <TagInput id={id} tags={tags} onChange={setTags} known={allTags(skills)} />

          <div className="library-dialog-actions">
            <button type="button" className="board-confirm-cancel" onClick={requestClose}>
              Cancel
            </button>
            <button ref={submitRef} type="submit" className="library-dialog-submit" disabled={!canSave}>
              {editing ? "Save changes" : "Upload"}
            </button>
          </div>
        </form>
      )}
    </LibraryDialog>
  );
}

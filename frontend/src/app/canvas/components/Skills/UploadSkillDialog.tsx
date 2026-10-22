"use client";

import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { useSkills } from "@/store/skills.store";
import BoardConfirmDialog from "../Sidebar/BoardConfirmDialog";
import LibraryDialog, { pickMarkdownFile } from "../Library/LibraryDialog";
import FileField, { readPickedFile, type ChosenFile } from "../Library/FileField";
import TagInput from "../Library/TagInput";
import {
  MAX_DESCRIPTION,
  MAX_NAME,
  allTags,
  descriptionError,
  findByName,
  nameError,
  newId,
  uniqueName,
} from "../../library/fields";
import { metaFromFile, type Skill } from "../../skills/skillFile";

/**
 * Upload skill (#206): the file, then a name, a description and optional tags.
 *
 * The file comes first because it can fill in the rest. Upload stays
 * disabled until the file, name and description are all good, so errors
 * show as the user leaves a field rather than on a failed submit.
 */
export default function UploadSkillDialog({
  initialFile,
  onClose,
  onUploaded,
  onSaveFailed,
}: {
  /** A file dropped on the page, already chosen when the dialog opens. */
  initialFile?: File;
  onClose: () => void;
  /** After the skill is saved; the dialog is then closed by the parent. */
  onUploaded: (name: string, replaced: boolean) => void;
  /** The save was refused by storage; the dialog stays open. */
  onSaveFailed: () => void;
}) {
  const skills = useSkills((s) => s.skills);
  const add = useSkills((s) => s.add);
  const replace = useSkills((s) => s.replace);

  const [file, setFile] = useState<ChosenFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [touched, setTouched] = useState({ name: false, description: false });
  const [duplicate, setDuplicate] = useState<Skill | null>(null);

  const dropRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  // Read when a file arrives, which is after the click that asked for it.
  const fieldsRef = useRef({ name, description, tags });
  fieldsRef.current = { name, description, tags };

  const chooseFile = async (picked: File) => {
    const read = await readPickedFile(picked, { tag: "[skills]" });
    if (!read.ok) {
      setFile(null);
      setFileError(read.error);
      return;
    }
    setFile(read.file);
    setFileError(null);
    // Fill in only what the user has not entered yet.
    const meta = metaFromFile(read.file.content, read.file.name);
    if (!fieldsRef.current.name.trim()) setName(meta.name);
    if (!fieldsRef.current.description.trim()) setDescription(meta.description);
    if (!fieldsRef.current.tags.length) setTags(meta.tags);
    nameRef.current?.focus();
  };

  useEffect(() => {
    if (initialFile) void chooseFile(initialFile);
    else dropRef.current?.focus();
    // Once, for the file the dialog was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const errors = { name: nameError(name), description: descriptionError(description) };
  const canUpload = !!file && !errors.name && !errors.description;
  const existing = findByName(skills, name);

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
    let finalName = name.trim();
    if (mode === "replace" && duplicate) {
      finalName = duplicate.name;
      saved = replace({ ...duplicate, ...fields });
    } else {
      if (mode === "keep") finalName = uniqueName(skills, finalName);
      saved = add({ id: newId("skill"), name: finalName, createdAt: Date.now(), ...fields });
    }
    setDuplicate(null);
    if (saved) onUploaded(finalName, mode === "replace");
    else onSaveFailed();
  };

  const submit = () => {
    if (!canUpload) return;
    if (existing) setDuplicate(existing);
    else save("new");
  };

  return (
    <LibraryDialog
      title="Upload skill"
      subtitle="Choose a markdown file, then describe it."
      onRequestClose={onClose}
      onFileDrop={(dropped) => void chooseFile(dropped)}
      after={
        duplicate && (
          <BoardConfirmDialog
            title={`Replace “${duplicate.name}”?`}
            confirmLabel="Replace"
            tone="primary"
            onCancel={() => {
              setDuplicate(null);
              submitRef.current?.focus();
            }}
            onConfirm={() => save("replace")}
            secondary={{ label: "Keep both", onClick: () => save("keep") }}
          >
            A skill with this name already exists. Replacing it swaps in this file, description and tags.
          </BoardConfirmDialog>
        )
      }
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
            changeLabel="Change"
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
              placeholder="e.g. Brand voice"
              maxLength={MAX_NAME}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, name: true }))}
              aria-invalid={touched.name && !!errors.name}
              aria-describedby={`${id}-name-note`}
            />
            <p
              id={`${id}-name-note`}
              className={touched.name && errors.name ? "library-field-error" : "library-field-hint"}
            >
              {touched.name && errors.name
                ? errors.name
                : existing
                  ? `You already have “${existing.name}”. You'll be asked to replace it or keep both.`
                  : ""}
            </p>
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
            <button type="button" className="board-confirm-cancel" onClick={onClose}>
              Cancel
            </button>
            <button ref={submitRef} type="submit" className="library-dialog-submit" disabled={!canUpload}>
              Upload
            </button>
          </div>
        </form>
      )}
    </LibraryDialog>
  );
}

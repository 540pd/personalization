"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Upload, X } from "lucide-react";
import { useSkills } from "@/store/skills.store";
import BoardConfirmDialog from "../Sidebar/BoardConfirmDialog";
import {
  MAX_DESCRIPTION,
  MAX_NAME,
  MAX_TAG,
  MAX_TAGS,
  allTags,
  descriptionError,
  fileProblem,
  findByName,
  formatSize,
  metaFromFile,
  nameError,
  normalizeTag,
  uniqueName,
  type Skill,
} from "../../skills/skillFile";

interface ChosenFile {
  name: string;
  size: number;
  content: string;
}

const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

const newId = () => `skill-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Upload skill (#206): the file, then a name, a description and optional tags.
 *
 * The file comes first because it can fill the next two in. Upload stays
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
  const id = useId();
  const skills = useSkills((s) => s.skills);
  const add = useSkills((s) => s.add);
  const replace = useSkills((s) => s.replace);

  const [file, setFile] = useState<ChosenFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagText, setTagText] = useState("");
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [suggestionsHidden, setSuggestionsHidden] = useState(false);
  const [touched, setTouched] = useState({ name: false, description: false });
  const [duplicate, setDuplicate] = useState<Skill | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const fileButtonRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  // Read when a file arrives, which is after the click that asked for it.
  const fieldsRef = useRef({ name, description });
  fieldsRef.current = { name, description };

  const chooseFile = async (picked: File) => {
    const problem = fileProblem(picked);
    if (problem) {
      setFile(null);
      setFileError(problem);
      return;
    }
    let content: string;
    try {
      content = await picked.text();
    } catch (err) {
      console.warn("[skills] Could not read the skill file.", err);
      setFile(null);
      setFileError(`Couldn't read ${picked.name}`);
      return;
    }
    if (!content.trim()) {
      setFile(null);
      setFileError(`${picked.name} is empty`);
      return;
    }
    setFile({ name: picked.name, size: picked.size, content });
    setFileError(null);
    // Fill in only what the user has not typed yet.
    const meta = metaFromFile(content, picked.name);
    if (!fieldsRef.current.name.trim()) setName(meta.name);
    if (!fieldsRef.current.description.trim()) setDescription(meta.description);
    nameRef.current?.focus();
  };

  // A fresh input per pick, as Open file does: one kept in the page would
  // make "the file input" ambiguous beside the dock's upload.
  const pickFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.markdown,text/markdown";
    input.addEventListener("change", () => {
      const picked = input.files?.[0];
      if (picked) void chooseFile(picked);
    });
    input.click();
  };

  useEffect(() => {
    if (initialFile) void chooseFile(initialFile);
    else fileButtonRef.current?.focus();
    // Once, for the file the dialog was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addTag = (raw: string) => {
    const tag = normalizeTag(raw);
    setTagText("");
    setActiveSuggestion(-1);
    if (!tag || tags.length >= MAX_TAGS) return;
    setTags((current) => (current.includes(tag) || current.length >= MAX_TAGS ? current : [...current, tag]));
  };

  const typed = normalizeTag(tagText);
  const suggestions =
    typed && !suggestionsHidden
      ? allTags(skills).filter((t) => t.startsWith(typed) && t !== typed && !tags.includes(t)).slice(0, 6)
      : [];

  const onTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(activeSuggestion >= 0 ? suggestions[activeSuggestion] : tagText);
    } else if (e.key === "Backspace" && !tagText && tags.length) {
      setTags((current) => current.slice(0, -1));
    } else if (e.key === "ArrowDown" && suggestions.length) {
      e.preventDefault();
      setActiveSuggestion((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp" && suggestions.length) {
      e.preventDefault();
      setActiveSuggestion((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Escape" && suggestions.length) {
      // The list closes; the dialog stays.
      e.stopPropagation();
      setSuggestionsHidden(true);
    }
  };

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
      saved = add({ id: newId(), name: finalName, createdAt: Date.now(), ...fields });
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

  const onKeyDown = (e: React.KeyboardEvent) => {
    // The page and the board's window listeners stay out of it.
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not([readonly]), textarea") ?? [],
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

  const atTagLimit = tags.length >= MAX_TAGS;

  return createPortal(
    <div
      className="skill-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      // Drops land in the dialog, never on the page behind it.
      onDragOver={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        const dropped = e.dataTransfer.files[0];
        if (dropped) void chooseFile(dropped);
      }}
    >
      <div
        ref={dialogRef}
        className="skill-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onKeyDown={onKeyDown}
      >
        <div className="skill-dialog-header">
          <div>
            <h2 id={`${id}-title`} className="skill-dialog-title">
              Upload skill
            </h2>
            <p className="skill-dialog-subtitle">Choose a markdown file, then describe it.</p>
          </div>
          <button type="button" className="skill-dialog-close" aria-label="Close" onClick={onClose}>
            <X size={15} aria-hidden />
          </button>
        </div>

        <form
          className="skill-dialog-body"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div>
            <p className="skill-field-label" id={`${id}-file-label`}>
              File
            </p>
            {file ? (
              <div className="skill-file-chosen">
                <span className="skill-file-icon" aria-hidden>
                  <FileText size={17} />
                </span>
                <span className="skill-file-text">
                  <span className="skill-file-name">{file.name}</span>
                  <span className="skill-file-meta">{formatSize(file.size)}</span>
                </span>
                <button type="button" className="skill-file-change" onClick={pickFile}>
                  Change
                </button>
              </div>
            ) : (
              <button
                ref={fileButtonRef}
                type="button"
                className={dragOver ? "skill-file-drop skill-file-drop-over" : "skill-file-drop"}
                aria-labelledby={`${id}-file-label ${id}-file-hint`}
                aria-describedby={fileError ? `${id}-file-error` : undefined}
                onClick={pickFile}
                onDragEnter={(e) => isFileDrag(e) && setDragOver(true)}
                onDragLeave={() => setDragOver(false)}
              >
                <Upload size={20} aria-hidden />
                <span id={`${id}-file-hint`} className="skill-file-drop-title">
                  Choose a .md file or drop it here
                </span>
                <span className="skill-file-drop-hint">Markdown only · up to 100 KB</span>
              </button>
            )}
            {fileError && (
              <p id={`${id}-file-error`} className="skill-field-error" role="alert">
                {fileError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={`${id}-name`} className="skill-field-label">
              Name
            </label>
            <input
              ref={nameRef}
              id={`${id}-name`}
              type="text"
              className="skill-input"
              placeholder="e.g. Brand voice"
              maxLength={MAX_NAME}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, name: true }))}
              aria-invalid={touched.name && !!errors.name}
              aria-describedby={`${id}-name-note`}
            />
            <p id={`${id}-name-note`} className={touched.name && errors.name ? "skill-field-error" : "skill-field-hint"}>
              {touched.name && errors.name
                ? errors.name
                : existing
                  ? `You already have “${existing.name}”. You'll be asked to replace it or keep both.`
                  : ""}
            </p>
          </div>

          <div>
            <div className="skill-field-label-row">
              <label htmlFor={`${id}-description`} className="skill-field-label">
                Description
              </label>
              <span className="skill-field-count" aria-hidden>
                {description.length} / {MAX_DESCRIPTION}
              </span>
            </div>
            <textarea
              id={`${id}-description`}
              className="skill-input skill-textarea"
              rows={2}
              placeholder="What this skill does, in one line"
              maxLength={MAX_DESCRIPTION}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, description: true }))}
              aria-invalid={touched.description && !!errors.description}
              aria-describedby={`${id}-description-note`}
            />
            <p id={`${id}-description-note`} className="skill-field-error">
              {touched.description ? errors.description : ""}
            </p>
          </div>

          <div className="skill-tags-field">
            <label htmlFor={`${id}-tags`} className="skill-field-label">
              Tags <span className="skill-field-optional">(optional)</span>
            </label>
            <div className="skill-tags-box">
              {tags.map((tag) => (
                <span key={tag} className="skill-tag-chip">
                  {tag}
                  <button
                    type="button"
                    className="skill-tag-remove"
                    aria-label={`Remove tag ${tag}`}
                    onClick={() => setTags((current) => current.filter((t) => t !== tag))}
                  >
                    <X size={11} strokeWidth={2.5} aria-hidden />
                  </button>
                </span>
              ))}
              <input
                id={`${id}-tags`}
                type="text"
                className="skill-tags-input"
                placeholder={tags.length ? "" : "Type a tag and press Enter"}
                maxLength={MAX_TAG}
                readOnly={atTagLimit}
                value={tagText}
                onChange={(e) => {
                  const value = e.target.value;
                  setSuggestionsHidden(false);
                  setActiveSuggestion(-1);
                  // A pasted "a, b, c" becomes chips up to the last comma.
                  if (value.includes(",")) {
                    const parts = value.split(",");
                    parts.slice(0, -1).forEach(addTag);
                    setTagText(parts[parts.length - 1]);
                  } else {
                    setTagText(value);
                  }
                }}
                onKeyDown={onTagKeyDown}
                onBlur={() => tagText.trim() && addTag(tagText)}
                role="combobox"
                aria-expanded={suggestions.length > 0}
                aria-controls={`${id}-tag-suggestions`}
                aria-autocomplete="list"
                aria-activedescendant={activeSuggestion >= 0 ? `${id}-tag-${activeSuggestion}` : undefined}
                aria-describedby={`${id}-tags-hint`}
              />
            </div>
            <p id={`${id}-tags-hint`} className="skill-field-hint">
              {atTagLimit ? `Up to ${MAX_TAGS} tags. Remove one to add another.` : `Enter or comma to add · up to ${MAX_TAGS} tags`}
            </p>
            {suggestions.length > 0 && (
              <ul id={`${id}-tag-suggestions`} role="listbox" aria-label="Matching tags" className="skill-tag-suggestions">
                {suggestions.map((tag, i) => (
                  <li
                    key={tag}
                    id={`${id}-tag-${i}`}
                    role="option"
                    aria-selected={i === activeSuggestion}
                    className={i === activeSuggestion ? "skill-tag-suggestion skill-tag-suggestion-active" : "skill-tag-suggestion"}
                    // mousedown, not click: the input's blur would add the typed text first.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addTag(tag);
                    }}
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="skill-dialog-actions">
            <button type="button" className="board-confirm-cancel" onClick={onClose}>
              Cancel
            </button>
            <button ref={submitRef} type="submit" className="skill-dialog-submit" disabled={!canUpload}>
              Upload
            </button>
          </div>
        </form>
      </div>

      {duplicate && (
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
      )}
    </div>,
    document.body,
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Download } from "lucide-react";
import { useAgents, type Agent } from "@/store/agents.store";
import { useSkills } from "@/store/skills.store";
import BoardConfirmDialog from "../Sidebar/BoardConfirmDialog";
import LibraryDialog, { DiscardChanges, NameNote, pickMarkdownFile } from "../Library/LibraryDialog";
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
  sameList,
  uniqueName,
} from "../../library/fields";
import { stripFrontMatter } from "../../skills/skillFile";
import {
  agentFileNotes,
  agentSummary,
  downloadExampleAgentFile,
  readAgentFile,
  type AgentFile,
} from "../../agents/agent";

/** How the agent was saved, for the toast. */
export type AgentSaved = "added" | "replaced" | "saved";

type Confirm = { kind: "duplicate"; existing: Agent } | { kind: "discard" };

/**
 * Upload agent (#208), and Edit agent (#210) when given `editing`.
 *
 * An agent is a markdown file. Its body is the instructions and its front
 * matter sets the model and skills, so the form asks only for what a person
 * may want to word differently -- the name, the description and tags -- and
 * fills those in from the file too. Problems in a file that need not stop it
 * (a model that does not exist, a skill not in the library) are notes under
 * the file, never errors.
 *
 * Editing, Replace file… takes the new file's instructions, model and skills
 * on save, but leaves the name, description and tags as the user set them.
 */
export default function UploadAgentDialog({
  editing,
  initialFile,
  onClose,
  onSaved,
  onSaveFailed,
}: {
  /** The agent being edited; without it the dialog uploads a new one. */
  editing?: Agent;
  /** A file dropped on the page, already chosen when the dialog opens. */
  initialFile?: File;
  onClose: () => void;
  onSaved: (name: string, how: AgentSaved) => void;
  onSaveFailed: () => void;
}) {
  const agents = useAgents((s) => s.agents);
  const add = useAgents((s) => s.add);
  const replace = useAgents((s) => s.replace);
  const skills = useSkills((s) => s.skills);

  const [file, setFile] = useState<ChosenFile | null>(
    editing ? { name: editing.fileName, size: editing.size, content: editing.content } : null,
  );
  // Editing, what the saved agent has; skills that no longer exist are
  // dropped here, so a save writes only ids that still match (#210 AC6).
  const [parsed, setParsed] = useState<AgentFile | null>(() =>
    editing
      ? {
          name: editing.name,
          description: editing.description,
          tags: editing.tags,
          instructions: editing.instructions,
          model: editing.model,
          skillIds: editing.skillIds.filter((id) => skills.some((s) => s.id === id)),
          missingSkills: [],
        }
      : null,
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
    const read = await readPickedFile(picked, {
      tag: "[agents]",
      // The body is the instructions: front matter alone is not an agent.
      isEmpty: (text) => !stripFrontMatter(text).trim(),
    });
    if (!read.ok) {
      // Editing, the agent keeps its own file: only the new one is refused.
      if (!editing) {
        setFile(null);
        setParsed(null);
      }
      setFileError(read.error);
      return;
    }
    const agentFile = readAgentFile(read.file.content, read.file.name, skills);
    setFile(read.file);
    setParsed(agentFile);
    setFileChanged(true);
    setFileError(null);
    if (editing) return;
    // Fill in only what the user has not entered yet.
    if (!fieldsRef.current.name.trim()) setName(agentFile.name);
    if (!fieldsRef.current.description.trim()) setDescription(agentFile.description);
    if (!fieldsRef.current.tags.length) setTags(agentFile.tags);
    nameRef.current?.focus();
  };

  useEffect(() => {
    if (initialFile) void chooseFile(initialFile);
    else if (editing) nameRef.current?.focus();
    else dropRef.current?.focus();
    // Once, for the file the dialog was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Editing, a name another agent has is an error; uploading, it asks Replace or Keep both.
  const existing = findByName(editing ? agents.filter((a) => a.id !== editing.id) : agents, name);
  const errors = {
    name: nameError(name) ?? (editing && existing ? `You already have an agent called “${existing.name}”` : null),
    description: descriptionError(description),
  };
  const dirty = editing
    ? fileChanged ||
      name.trim() !== editing.name ||
      description.trim() !== editing.description ||
      !sameList(tags, editing.tags)
    : false;
  const canSave = !!file && !!parsed && !errors.name && !errors.description && (!editing || dirty);

  const requestClose = () => {
    if (dirty) setConfirm({ kind: "discard" });
    else onClose();
  };

  const save = (mode: "new" | "replace" | "keep") => {
    if (!file || !parsed) return;
    const fields = {
      description: description.trim(),
      tags,
      instructions: parsed.instructions,
      model: parsed.model,
      skillIds: parsed.skillIds,
      fileName: file.name,
      size: file.size,
      content: file.content,
    };
    let saved: boolean;
    let finalName = name.trim();
    let how: AgentSaved = "added";
    if (editing) {
      saved = replace({ ...editing, ...fields, name: finalName });
      how = "saved";
    } else if (mode === "replace" && confirm?.kind === "duplicate") {
      finalName = confirm.existing.name;
      saved = replace({ ...confirm.existing, ...fields });
      how = "replaced";
    } else {
      if (mode === "keep") finalName = uniqueName(agents, finalName);
      saved = add({ id: newId("agent"), name: finalName, createdAt: Date.now(), ...fields });
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
        An agent with this name already exists. Replacing it swaps in this file, description and tags.
      </BoardConfirmDialog>
    ) : confirm?.kind === "discard" && editing ? (
      <DiscardChanges name={editing.name} onKeepEditing={cancelConfirm} onDiscard={onClose} />
    ) : null;

  const meta = parsed
    ? agentSummary(parsed.model, parsed.skillIds.length) +
      (editing && fileChanged ? ` · replaces ${editing.fileName} when you save` : "")
    : undefined;

  return (
    <LibraryDialog
      title={editing ? "Edit agent" : "Upload agent"}
      subtitle={
        editing
          ? "Changes apply the next time it's picked in a Prompt panel."
          : "Choose its markdown file, then check the name and description."
      }
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
            icon={<Bot size={17} />}
            meta={meta}
            changeLabel={editing ? "Replace file…" : "Change"}
            error={fileError}
            notes={parsed ? agentFileNotes(parsed) : []}
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
              placeholder="e.g. Copywriter"
              maxLength={MAX_NAME}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, name: true }))}
              aria-invalid={(touched.name || !!editing) && !!errors.name}
              aria-describedby={`${id}-name-note`}
            />
            <NameNote
              id={`${id}-name-note`}
              // A taken name shows at once while editing: it is why Save is off.
              error={touched.name || editing ? errors.name : null}
              hint={
                editing
                  ? fileChanged
                    ? "Kept as you set it. Replacing the file doesn't rename the agent."
                    : ""
                  : existing
                    ? `You already have “${existing.name}”. You'll be asked to replace it or keep both.`
                    : ""
              }
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
            <input
              id={`${id}-description`}
              type="text"
              className="library-input"
              placeholder="What this agent is for, in one line"
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

          <TagInput id={id} tags={tags} onChange={setTags} known={allTags(agents)} />

          <div className="library-dialog-actions">
            <button type="button" className="library-example-link" onClick={downloadExampleAgentFile}>
              <Download size={14} aria-hidden />
              Example agent file
            </button>
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

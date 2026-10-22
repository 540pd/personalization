"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Download } from "lucide-react";
import { useAgents, type Agent } from "@/store/agents.store";
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
import { stripFrontMatter } from "../../skills/skillFile";
import {
  agentFileNotes,
  agentSummary,
  downloadExampleAgentFile,
  readAgentFile,
  type AgentFile,
} from "../../agents/agent";

/**
 * Upload agent (#208): an agent is a markdown file. Its body is the
 * instructions and its front matter sets the model and skills, so the form
 * asks only for what a person may want to word differently -- the name,
 * the description and tags -- and fills those in from the file too.
 *
 * Problems in the file that need not stop it (a model that does not exist,
 * a skill not in the library) are notes under the file, never errors.
 */
export default function UploadAgentDialog({
  initialFile,
  onClose,
  onUploaded,
  onSaveFailed,
}: {
  /** A file dropped on the page, already chosen when the dialog opens. */
  initialFile?: File;
  onClose: () => void;
  onUploaded: (name: string, replaced: boolean) => void;
  onSaveFailed: () => void;
}) {
  const agents = useAgents((s) => s.agents);
  const add = useAgents((s) => s.add);
  const replace = useAgents((s) => s.replace);
  const skills = useSkills((s) => s.skills);

  const [file, setFile] = useState<ChosenFile | null>(null);
  const [parsed, setParsed] = useState<AgentFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [touched, setTouched] = useState({ name: false, description: false });
  const [duplicate, setDuplicate] = useState<Agent | null>(null);

  const dropRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  // Read when a file arrives, which is after the click that asked for it.
  const fieldsRef = useRef({ name, description, tags });
  fieldsRef.current = { name, description, tags };

  const chooseFile = async (picked: File) => {
    const read = await readPickedFile(picked, {
      tag: "[agents]",
      // The body is the instructions: front matter alone is not an agent.
      isEmpty: (text) => !stripFrontMatter(text).trim(),
    });
    if (!read.ok) {
      setFile(null);
      setParsed(null);
      setFileError(read.error);
      return;
    }
    const agentFile = readAgentFile(read.file.content, read.file.name, skills);
    setFile(read.file);
    setParsed(agentFile);
    setFileError(null);
    // Fill in only what the user has not entered yet.
    if (!fieldsRef.current.name.trim()) setName(agentFile.name);
    if (!fieldsRef.current.description.trim()) setDescription(agentFile.description);
    if (!fieldsRef.current.tags.length) setTags(agentFile.tags);
    nameRef.current?.focus();
  };

  useEffect(() => {
    if (initialFile) void chooseFile(initialFile);
    else dropRef.current?.focus();
    // Once, for the file the dialog was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const errors = { name: nameError(name), description: descriptionError(description) };
  const canUpload = !!file && !!parsed && !errors.name && !errors.description;
  const existing = findByName(agents, name);

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
    if (mode === "replace" && duplicate) {
      finalName = duplicate.name;
      saved = replace({ ...duplicate, ...fields });
    } else {
      if (mode === "keep") finalName = uniqueName(agents, finalName);
      saved = add({ id: newId("agent"), name: finalName, createdAt: Date.now(), ...fields });
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
      title="Upload agent"
      subtitle="Choose its markdown file, then check the name and description."
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
            An agent with this name already exists. Replacing it swaps in this file, description and tags.
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
            icon={<Bot size={17} />}
            meta={parsed ? agentSummary(parsed.model, parsed.skillIds.length) : undefined}
            changeLabel="Change"
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

"use client";

import { Bot, Download } from "lucide-react";
import { useAgents, type Agent } from "@/store/agents.store";
import { useSkills } from "@/store/skills.store";
import FileField from "../Library/FileField";
import TagInput from "../Library/TagInput";
import { DescriptionField, DialogActions, LibraryItemDialog, NameField } from "../Library/ItemForm";
import { useLibraryItemForm } from "../Library/useLibraryItemForm";
import { allTags } from "../../library/fields";
import type { ItemSaved, LibraryNoun } from "../../library/itemForm";
import { stripFrontMatter } from "../../skills/skillFile";
import { agentFileNotes, agentSummary, downloadExampleAgentFile, readAgentFile, type AgentFile } from "../../agents/agent";

export const AGENT_NOUN: LibraryNoun = { one: "agent", many: "agents", a: "an agent" };

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
  onSaved: (name: string, how: ItemSaved) => void;
  onSaveFailed: () => void;
}) {
  const agents = useAgents((s) => s.agents);
  const skills = useSkills((s) => s.skills);
  const form = useLibraryItemForm({
    noun: AGENT_NOUN,
    items: agents,
    add: useAgents((s) => s.add),
    replace: useAgents((s) => s.replace),
    editing,
    initialFile,
    // Editing, what the saved agent has; skills that no longer exist are
    // dropped here, so a save writes only ids that still match (#210 AC6).
    initialParsed: (): AgentFile | null =>
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
    parse: (file) => readAgentFile(file.content, file.name, skills),
    // The body is the instructions: front matter alone is not an agent.
    isEmpty: (text) => !stripFrontMatter(text).trim(),
    build: (base, parsed) => ({
      ...base,
      instructions: parsed.instructions,
      model: parsed.model,
      skillIds: parsed.skillIds,
    }),
    onClose,
    onSaved,
    onSaveFailed,
  });
  const { parsed } = form;

  const meta = parsed
    ? agentSummary(parsed.model, parsed.skillIds.length) +
      (editing && form.fileChanged ? ` · replaces ${editing.fileName} when you save` : "")
    : undefined;

  return (
    <LibraryItemDialog
      form={form}
      title={editing ? "Edit agent" : "Upload agent"}
      subtitle={
        editing
          ? "Changes apply the next time it's picked in a Prompt panel."
          : "Choose its markdown file, then check the name and description."
      }
    >
      {(id) => (
        <>
          <FileField
            id={id}
            file={form.file}
            icon={<Bot size={17} />}
            meta={meta}
            changeLabel={editing ? "Replace file…" : "Change"}
            error={form.fileError}
            notes={parsed ? agentFileNotes(parsed) : []}
            onPick={form.pick}
            dropRef={form.dropRef}
          />
          <NameField
            id={id}
            form={form}
            placeholder="e.g. copywriter"
            replacedFileHint="Kept as you set it. Replacing the file doesn't rename the agent."
          />
          <DescriptionField id={id} form={form} placeholder="What this agent is for, in one line" />
          <TagInput id={id} tags={form.tags} onChange={form.setTags} known={allTags(agents)} />
          <DialogActions form={form}>
            <button type="button" className="library-example-link" onClick={downloadExampleAgentFile}>
              <Download size={14} aria-hidden />
              Example agent file
            </button>
          </DialogActions>
        </>
      )}
    </LibraryItemDialog>
  );
}

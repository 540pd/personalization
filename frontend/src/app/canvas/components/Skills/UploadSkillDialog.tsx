"use client";

import { FileText } from "lucide-react";
import { useSkills } from "@/store/skills.store";
import FileField from "../Library/FileField";
import TagInput from "../Library/TagInput";
import { DescriptionField, DialogActions, LibraryItemDialog, NameField } from "../Library/ItemForm";
import { useLibraryItemForm } from "../Library/useLibraryItemForm";
import { allTags } from "../../library/fields";
import type { ItemSaved, LibraryNoun } from "../../library/itemForm";
import { metaFromFile, type Skill } from "../../skills/skillFile";

export const SKILL_NOUN: LibraryNoun = { one: "skill", many: "skills", a: "a skill" };

/** Upload skill (#206), and Edit skill (#210) when given `editing`. */
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
  onSaved: (name: string, how: ItemSaved) => void;
  /** The save was refused by storage; the dialog stays open. */
  onSaveFailed: () => void;
}) {
  const skills = useSkills((s) => s.skills);
  const form = useLibraryItemForm({
    noun: SKILL_NOUN,
    items: skills,
    add: useSkills((s) => s.add),
    replace: useSkills((s) => s.replace),
    editing,
    initialFile,
    initialParsed: () => editing ?? null,
    parse: (file) => metaFromFile(file.content, file.name),
    build: (base) => base,
    onClose,
    onSaved,
    onSaveFailed,
  });

  return (
    <LibraryItemDialog
      form={form}
      title={editing ? "Edit skill" : "Upload skill"}
      subtitle={editing ? "Agents using it pick up the change." : "Choose a markdown file, then describe it."}
    >
      {(id) => (
        <>
          <FileField
            id={id}
            file={form.file}
            icon={<FileText size={17} />}
            meta={editing && form.fileChanged ? `replaces ${editing.fileName} when you save` : undefined}
            changeLabel={editing ? "Replace file…" : "Change"}
            error={form.fileError}
            onPick={form.pick}
            dropRef={form.dropRef}
          />
          <NameField id={id} form={form} placeholder="e.g. brand-voice" />
          <DescriptionField id={id} form={form} placeholder="What this skill does, in one line" multiline />
          <TagInput id={id} tags={form.tags} onChange={form.setTags} known={allTags(skills)} />
          <DialogActions form={form} />
        </>
      )}
    </LibraryItemDialog>
  );
}

// The decisions behind a library's Upload / Edit form -- Skills (#206, #210),
// Agents (#208, #210): has the edit changed anything, may it be saved, and
// what a save does to the name. Pure, so they are tested without a DOM.

import { sameList, toHandle, uniqueName, type Listed } from "./fields";

/** How one library's items are worded: "1 skill", "Search skills", "a skill called…". */
export interface LibraryNoun {
  one: string;
  many: string;
  /** With its article: "a skill", "an agent". */
  a: string;
}

/** How the item was saved, for the toast. */
export type ItemSaved = "added" | "replaced" | "saved";

/** Upload as typed, Replace the item with the same name, or Keep both. */
export type SaveMode = "new" | "replace" | "keep";

/** What the form holds that an edit can change. */
export interface FormFields {
  name: string;
  description: string;
  tags: string[];
  /** Replace file… picked a new file. */
  fileChanged: boolean;
}

/** Editing, whether anything differs from the saved item; uploading, never (there is nothing to lose). */
export function isDirty(editing: Listed | undefined, form: FormFields): boolean {
  if (!editing) return false;
  return (
    form.fileChanged ||
    toHandle(form.name) !== editing.name ||
    form.description.trim() !== editing.description ||
    !sameList(form.tags, editing.tags)
  );
}

/** A file is in, the fields are valid, and an edit has changed something. */
export function canSaveForm({
  hasFile,
  errors,
  editing,
  dirty,
}: {
  hasFile: boolean;
  errors: { name: string | null; description: string | null };
  editing: boolean;
  dirty: boolean;
}): boolean {
  return hasFile && !errors.name && !errors.description && (!editing || dirty);
}

/**
 * What a save does: the name it ends up with, how to word the toast, and
 * the item it overwrites, if any (`base`; undefined means add a new one).
 */
export function savePlan<T extends Listed>({
  mode,
  name,
  editing,
  duplicate,
  items,
}: {
  mode: SaveMode;
  /** As typed. */
  name: string;
  editing?: T;
  /** The item with the same name, when the duplicate-name confirm is up. */
  duplicate?: T;
  items: readonly T[];
}): { name: string; how: ItemSaved; base?: T } {
  if (editing) return { name: toHandle(name), how: "saved", base: editing };
  if (mode === "replace" && duplicate) return { name: duplicate.name, how: "replaced", base: duplicate };
  return { name: mode === "keep" ? uniqueName(items, toHandle(name)) : toHandle(name), how: "added" };
}

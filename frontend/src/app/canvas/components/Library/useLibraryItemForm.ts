"use client";

import { useEffect, useRef, useState } from "react";
import { readPickedFile, type ChosenFile } from "./FileField";
import { pickMarkdownFile } from "./LibraryDialog";
import { descriptionError, findByName, nameError, newId, type Listed } from "../../library/fields";
import {
  canSaveForm,
  isDirty,
  savePlan,
  type ItemSaved,
  type LibraryNoun,
  type SaveMode,
} from "../../library/itemForm";

/** What every library item keeps of its file. */
export interface FileItem extends Listed {
  fileName: string;
  size: number;
  content: string;
  createdAt: number;
}

/** What a file fills in, at least. */
type FileMeta = Pick<Listed, "name" | "description" | "tags">;

/** The fields every save writes; `build` adds the item's own. */
export type BaseFields = Pick<FileItem, "description" | "tags" | "fileName" | "size" | "content">;

export type FormConfirm<T> = { kind: "duplicate"; existing: T } | { kind: "discard" };

/**
 * The state and actions of a library's Upload / Edit dialog -- Upload skill
 * (#206), Upload agent (#208), and Edit (#210) when given `editing`.
 *
 * Upload: the file comes first because it can fill in the rest. Edit: the
 * item's own file is shown, Replace file… swaps it on save, and nothing is
 * re-filled from the new file -- the name, description and tags are the
 * user's by now.
 *
 * `parse` reads what the item needs from a file (an agent's model and
 * skills); `build` adds it to the fields a save writes.
 */
export function useLibraryItemForm<T extends FileItem, P extends FileMeta>({
  noun,
  items,
  add,
  replace,
  editing,
  initialFile,
  initialParsed,
  parse,
  isEmpty,
  build,
  onClose,
  onSaved,
  onSaveFailed,
}: {
  noun: LibraryNoun;
  items: readonly T[];
  add: (item: T) => boolean;
  replace: (item: T) => boolean;
  /** The item being edited; without it the dialog uploads a new one. */
  editing?: T;
  /** A file dropped on the page, already chosen when the dialog opens. */
  initialFile?: File;
  /** Editing, what the saved item's file gave; null while uploading. */
  initialParsed: () => P | null;
  parse: (file: ChosenFile) => P;
  /** Whether a file's text is too empty to use; see readPickedFile. */
  isEmpty?: (text: string) => boolean;
  build: (base: BaseFields, parsed: P) => Omit<T, "id" | "name" | "createdAt">;
  onClose: () => void;
  /** After the item is saved; the dialog is then closed by the parent. */
  onSaved: (name: string, how: ItemSaved) => void;
  /** The save was refused by storage; the dialog stays open. */
  onSaveFailed: () => void;
}) {
  const [file, setFile] = useState<ChosenFile | null>(
    editing ? { name: editing.fileName, size: editing.size, content: editing.content } : null,
  );
  const [parsed, setParsed] = useState<P | null>(initialParsed);
  const [fileChanged, setFileChanged] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [tags, setTags] = useState<string[]>(editing?.tags ?? []);
  const [touched, setTouched] = useState({ name: false, description: false });
  const [confirm, setConfirmState] = useState<FormConfirm<T> | null>(null);

  const dropRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  // Read when a file arrives, which is after the click that asked for it.
  const fieldsRef = useRef({ name, description, tags });
  fieldsRef.current = { name, description, tags };
  // Where focus was when a confirm opened, so cancelling it puts focus back.
  const returnFocus = useRef<HTMLElement | null>(null);
  const setConfirm = (next: FormConfirm<T>) => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setConfirmState(next);
  };
  const cancelConfirm = () => {
    setConfirmState(null);
    requestAnimationFrame(() => (returnFocus.current?.isConnected ? returnFocus.current : submitRef.current)?.focus());
  };

  const chooseFile = async (picked: File) => {
    const read = await readPickedFile(picked, { tag: `[${noun.many}]`, isEmpty });
    if (!read.ok) {
      // Editing, the item keeps its own file: only the new one is refused.
      if (!editing) {
        setFile(null);
        setParsed(null);
      }
      setFileError(read.error);
      return;
    }
    const meta = parse(read.file);
    setFile(read.file);
    setParsed(meta);
    setFileChanged(true);
    setFileError(null);
    if (editing) return;
    // Fill in only what the user has not entered yet.
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

  // Editing, a name another item has is an error; uploading, it asks Replace or Keep both.
  const existing = findByName(editing ? items.filter((i) => i.id !== editing.id) : items, name);
  const errors = {
    name: nameError(name) ?? (editing && existing ? `You already have ${noun.a} called “${existing.name}”` : null),
    description: descriptionError(description),
  };
  const dirty = isDirty(editing, { name, description, tags, fileChanged });
  const canSave = canSaveForm({ hasFile: !!file && !!parsed, errors, editing: !!editing, dirty });

  const requestClose = () => {
    if (dirty) setConfirm({ kind: "discard" });
    else onClose();
  };

  const save = (mode: SaveMode) => {
    if (!file || !parsed) return;
    const fields = build(
      { description: description.trim(), tags, fileName: file.name, size: file.size, content: file.content },
      parsed,
    );
    const plan = savePlan({
      mode,
      name,
      editing,
      duplicate: confirm?.kind === "duplicate" ? confirm.existing : undefined,
      items,
    });
    const saved = plan.base
      ? replace({ ...plan.base, ...fields, name: plan.name })
      : add({ id: newId(noun.one), name: plan.name, createdAt: Date.now(), ...fields } as T);
    setConfirmState(null);
    if (saved) onSaved(plan.name, plan.how);
    else onSaveFailed();
  };

  const submit = () => {
    if (!canSave) return;
    if (!editing && existing) setConfirm({ kind: "duplicate", existing });
    else save("new");
  };

  return {
    noun,
    editing,
    file,
    parsed,
    fileChanged,
    fileError,
    name,
    setName,
    description,
    setDescription,
    tags,
    setTags,
    touched,
    setTouched,
    confirm,
    cancelConfirm,
    existing,
    errors,
    canSave,
    dropRef,
    nameRef,
    submitRef,
    chooseFile,
    pick: () => pickMarkdownFile((f) => void chooseFile(f)),
    requestClose,
    save,
    submit,
    onClose,
  };
}

export type LibraryItemForm = ReturnType<typeof useLibraryItemForm<FileItem, FileMeta>>;

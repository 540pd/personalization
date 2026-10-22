/**
 * A versioned list kept in localStorage -- the skills (#206) and agents (#208)
 * libraries: `{version, [field]: [...]}` under one key.
 *
 * Hand-written rather than zustand's persist, as sidebar.store is: neither
 * direction may throw. Storage can be full, disabled, or hold something
 * another build wrote, and none of that may take a page down. A write also
 * has to be able to fail visibly, so the caller only updates its state once
 * `save` returns true.
 */
export interface LocalList<T> {
  load: (storage?: Storage) => T[];
  save: (items: T[], storage?: Storage) => boolean;
}

export function localList<T>({
  key,
  field,
  version,
  tag,
  readItem,
}: {
  key: string;
  /** The array's property name in the stored object ("skills", "agents"). */
  field: string;
  version: number;
  /** Console prefix, e.g. "[skills]". */
  tag: string;
  /** One stored entry → an item, or null when it cannot be read. */
  readItem: (raw: unknown) => T | null;
}): LocalList<T> {
  let warnedSave = false;

  const load = (storage: Storage | undefined = globalThis.localStorage): T[] => {
    let text: string | null;
    try {
      text = storage?.getItem(key) ?? null;
    } catch (err) {
      console.warn(`${tag} Could not read the saved ${field}.`, err);
      return [];
    }
    if (text === null) return [];
    try {
      const data = JSON.parse(text) as Record<string, unknown> | null;
      const list = data?.[field];
      if (data?.version !== version || !Array.isArray(list)) throw new Error("unknown format");
      const items = list.map(readItem);
      if (items.some((s) => s === null)) console.warn(`${tag} Skipped saved ${field} that could not be read.`);
      return items.filter((s): s is T => s !== null);
    } catch (err) {
      // Left in place: the next save replaces it.
      console.warn(`${tag} The saved ${field} are unreadable and were ignored.`, err);
      return [];
    }
  };

  const save = (items: T[], storage: Storage | undefined = globalThis.localStorage): boolean => {
    try {
      if (!storage) throw new Error("no localStorage");
      storage.setItem(key, JSON.stringify({ version, [field]: items }));
      return true;
    } catch (err) {
      if (!warnedSave) {
        warnedSave = true;
        console.warn(`${tag} The ${field} could not be saved to localStorage.`, err);
      }
      return false;
    }
  };

  return { load, save };
}

/** For readItem: an array of strings, or null. */
export function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((t) => typeof t === "string") ? (value as string[]) : null;
}

/**
 * A versioned value kept in localStorage under its own key, as
 * `{version, [field]: value}` -- the settings (#214), and through localList
 * the skills (#206) and agents (#208) libraries.
 *
 * Hand-written rather than zustand's persist, as sidebar.store is: neither
 * direction may throw. Storage can be full, disabled, or hold something
 * another build wrote, and none of that may take a page down. A write also
 * has to be able to fail visibly, so the caller only updates its state once
 * `save` returns true.
 */
export interface LocalValue<T> {
  /** The saved value; `fallback()` for anything missing or unreadable. Never throws. */
  load: (storage?: Storage) => T;
  /** False when storage refused the write. Never throws. */
  save: (value: T, storage?: Storage) => boolean;
}

export function localValue<T>({
  key,
  field,
  version,
  tag,
  fallback,
  read,
}: {
  key: string;
  /** The value's property name in the stored object ("settings", "skills"). */
  field: string;
  version: number;
  /** Console prefix, e.g. "[skills]". */
  tag: string;
  /** What `load` returns when there is nothing usable saved. */
  fallback: () => T;
  /** The stored `field` → the value. Throws when it cannot be read at all. */
  read: (raw: unknown) => T;
}): LocalValue<T> {
  let warnedSave = false;

  const load = (storage: Storage | undefined = globalThis.localStorage): T => {
    let text: string | null;
    try {
      text = storage?.getItem(key) ?? null;
    } catch (err) {
      console.warn(`${tag} Could not read the saved ${field}.`, err);
      return fallback();
    }
    if (text === null) return fallback();
    try {
      const data = JSON.parse(text) as Record<string, unknown> | null;
      if (data?.version !== version) throw new Error("unknown format");
      return read(data[field]);
    } catch (err) {
      // Left in place: the next save replaces it.
      console.warn(`${tag} The saved ${field} are unreadable and were ignored.`, err);
      return fallback();
    }
  };

  const save = (value: T, storage: Storage | undefined = globalThis.localStorage): boolean => {
    try {
      if (!storage) throw new Error("no localStorage");
      storage.setItem(key, JSON.stringify({ version, [field]: value }));
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

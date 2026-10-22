import { create } from "zustand";
import { DEFAULT_SETTINGS, readSettings, type Settings } from "@/app/canvas/settings/settings";

/**
 * The user's settings (#214), kept in localStorage under their own key as
 * `{version, settings: {...}}`.
 *
 * Hand-written like localList, for the same reasons: neither direction may
 * throw, and the store only changes once the write has gone through, so a
 * control that could not be saved goes back to what is saved.
 */

export const SETTINGS_STORAGE_KEY = "gcos-settings";
const VERSION = 1;

let warnedSave = false;

/** The saved settings; the defaults for anything missing or unreadable. Never throws. */
export function loadSettings(storage: Storage | undefined = globalThis.localStorage): Settings {
  let text: string | null;
  try {
    text = storage?.getItem(SETTINGS_STORAGE_KEY) ?? null;
  } catch (err) {
    console.warn("[settings] Could not read the saved settings.", err);
    return { ...DEFAULT_SETTINGS };
  }
  if (text === null) return { ...DEFAULT_SETTINGS };
  try {
    const data = JSON.parse(text) as Record<string, unknown> | null;
    if (data?.version !== VERSION) throw new Error("unknown format");
    return readSettings(data.settings);
  } catch (err) {
    // Left in place: the next save replaces it.
    console.warn("[settings] The saved settings are unreadable and were ignored.", err);
    return { ...DEFAULT_SETTINGS };
  }
}

/** False when storage refused the write. Never throws. */
export function saveSettings(settings: Settings, storage: Storage | undefined = globalThis.localStorage): boolean {
  try {
    if (!storage) throw new Error("no localStorage");
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ version: VERSION, settings }));
    return true;
  } catch (err) {
    if (!warnedSave) {
      warnedSave = true;
      console.warn("[settings] The settings could not be saved to localStorage.", err);
    }
    return false;
  }
}

interface SettingsState {
  settings: Settings;
  /** Sets one setting; false (and nothing changes) if it could not be saved. */
  set: <K extends keyof Settings>(id: K, value: Settings[K]) => boolean;
  /** Every setting back to its default; false if that could not be saved. */
  reset: () => boolean;
}

export const useSettings = create<SettingsState>((set, get) => {
  const commit = (next: Settings) => {
    if (!saveSettings(next)) return false;
    set({ settings: next });
    return true;
  };
  return {
    settings: typeof window === "undefined" ? { ...DEFAULT_SETTINGS } : loadSettings(),
    set: (id, value) => commit({ ...get().settings, [id]: value }),
    reset: () => commit({ ...DEFAULT_SETTINGS }),
  };
});

import { create } from "zustand";
import { DEFAULT_SETTINGS, readSettings, type Settings } from "@/app/canvas/settings/settings";
import { localValue } from "@/lib/localValue";

/**
 * The user's settings (#214), kept in localStorage under their own key as
 * `{version, settings: {...}}`.
 *
 * A localValue, as the libraries are localLists: neither direction may
 * throw, and the store only changes once the write has gone through, so a
 * control that could not be saved goes back to what is saved.
 */

export const SETTINGS_STORAGE_KEY = "gcos-settings";

const stored = localValue<Settings>({
  key: SETTINGS_STORAGE_KEY,
  field: "settings",
  version: 1,
  tag: "[settings]",
  fallback: () => ({ ...DEFAULT_SETTINGS }),
  read: (raw) => readSettings(raw),
});

/** The saved settings; the defaults for anything missing or unreadable. Never throws. */
export const loadSettings = stored.load;

/** False when storage refused the write. Never throws. */
export const saveSettings = stored.save;

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

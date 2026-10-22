import { afterEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_STORAGE_KEY, loadSettings, saveSettings } from "../settings.store";
import { DEFAULT_SETTINGS, isDefault, readSettings, settingGroups, validValue, SETTINGS } from "@/app/canvas/settings/settings";

function memoryStorage(failWrites = false): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() { return data.size; },
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    removeItem: (k) => { data.delete(k); },
    setItem: (k, v) => {
      if (failWrites) throw new DOMException("quota", "QuotaExceededError");
      data.set(k, v);
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("settings list", () => {
  it("has Connection style and node names in Canvas, defaulting to today's behaviour", () => {
    expect(settingGroups().map((g) => [g.group, g.specs.map((s) => s.id)])).toEqual([
      ["Canvas", ["linkStyle", "showNodeNames"]],
    ]);
    expect(SETTINGS[0]).toMatchObject({ id: "linkStyle", type: "choice" });
    expect(SETTINGS[1]).toMatchObject({ id: "showNodeNames", type: "toggle" });
    expect(DEFAULT_SETTINGS).toEqual({ linkStyle: "link-curve", showNodeNames: true });
  });

  it("accepts only a boolean for a toggle", () => {
    expect(validValue(SETTINGS[1], false)).toBe(true);
    expect(validValue(SETTINGS[1], "false")).toBe(false);
  });

  it("groups in order of first appearance", () => {
    const spec = (id: string, group: string) =>
      ({ id, group, label: id, help: "", type: "toggle" }) as unknown as (typeof SETTINGS)[number];
    const groups = settingGroups([spec("a", "Canvas"), spec("b", "Account"), spec("c", "Canvas")]);
    expect(groups.map((g) => [g.group, g.specs.map((s) => s.id)])).toEqual([
      ["Canvas", ["a", "c"]],
      ["Account", ["b"]],
    ]);
  });

  it("accepts only a listed option for a choice", () => {
    expect(validValue(SETTINGS[0], "link-elbow")).toBe(true);
    expect(validValue(SETTINGS[0], "link-zigzag")).toBe(false);
    expect(validValue(SETTINGS[0], true)).toBe(false);
  });

  it("keeps valid values, defaults the rest and drops unknown keys", () => {
    expect(readSettings({ linkStyle: "link-straight", showNodeNames: false, other: 1 })).toEqual({
      linkStyle: "link-straight",
      showNodeNames: false,
    });
    expect(readSettings({ showNodeNames: "no" })).toEqual(DEFAULT_SETTINGS);
    expect(readSettings({ linkStyle: "nope" })).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(readSettings([1, 2])).toEqual(DEFAULT_SETTINGS);
  });

  it("knows when everything is at its default", () => {
    expect(isDefault(DEFAULT_SETTINGS)).toBe(true);
    expect(isDefault({ ...DEFAULT_SETTINGS, linkStyle: "link-elbow" })).toBe(false);
    expect(isDefault({ ...DEFAULT_SETTINGS, showNodeNames: false })).toBe(false);
  });
});

describe("settings storage", () => {
  it("round-trips under its own key", () => {
    const storage = memoryStorage();
    const elbow = { ...DEFAULT_SETTINGS, linkStyle: "link-elbow" as const };
    expect(saveSettings(elbow, storage)).toBe(true);
    expect(JSON.parse(storage.data.get(SETTINGS_STORAGE_KEY)!)).toEqual({ version: 1, settings: elbow });
    expect(loadSettings(storage)).toEqual(elbow);
  });

  it("gives the defaults when nothing is saved", () => {
    expect(loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS);
  });

  it("gives the defaults, with a [settings] warning, on unreadable data", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = memoryStorage();
    for (const text of ["{oops", JSON.stringify({ version: 2, settings: { linkStyle: "link-elbow" } })]) {
      storage.setItem(SETTINGS_STORAGE_KEY, text);
      expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    }
    expect(warn.mock.calls.every(([m]) => String(m).startsWith("[settings]"))).toBe(true);
  });

  it("reports a refused write without throwing", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(saveSettings(DEFAULT_SETTINGS, memoryStorage(true))).toBe(false);
  });

  it("never throws when storage itself does", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
    } as unknown as Storage;
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS);
  });
});

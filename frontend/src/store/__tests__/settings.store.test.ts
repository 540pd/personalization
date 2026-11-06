import { afterEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_STORAGE_KEY, loadSettings, saveSettings } from "../settings.store";
import {
  DEFAULT_SETTINGS, GROUP_INFO, isDefault, readSettings, settingGroups, toolShown, validValue, SETTINGS,
} from "@/app/canvas/settings/settings";

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
    expect(settingGroups()[0].group).toBe("Canvas");
    expect(settingGroups()[0].specs.map((s) => s.id)).toEqual(["linkStyle", "showNodeNames"]);
    expect(SETTINGS[0]).toMatchObject({ id: "linkStyle", type: "choice" });
    expect(SETTINGS[1]).toMatchObject({ id: "showNodeNames", type: "toggle" });
    expect(DEFAULT_SETTINGS).toMatchObject({ linkStyle: "link-curve", showNodeNames: true });
  });

  it("lists the Create and Shapes menu switches in menu order, with the requested defaults (#404)", () => {
    const groups = settingGroups().slice(1).map((g) => [g.group, g.specs.map((s) => [s.label, DEFAULT_SETTINGS[s.id]])]);
    expect(groups).toEqual([
      ["Create menu", [["Video", false], ["Prompt", true], ["Compose", true]]],
      [
        "Shapes menu",
        [
          ["Rectangle", true], ["Arrow", true], ["Line", false], ["Ellipse", false],
          ["Triangle", false], ["Block Arrow", false], ["Diamond", true],
        ],
      ],
    ]);
    // Image has no switch, and every menu switch names its dock item.
    expect(SETTINGS.some((s) => s.label === "Image")).toBe(false);
    expect(settingGroups().slice(1).flatMap((g) => g.specs).every((s) => s.type === "toggle" && s.tool)).toBe(true);
    expect(GROUP_INFO["Create menu"].count).toEqual({ always: 1 });
    expect(GROUP_INFO["Shapes menu"].allOffNotice).toMatch(/Shapes button is hidden/);
  });

  it("shows a tool only while its switch is on; one without a switch always (#404)", () => {
    expect(toolShown(DEFAULT_SETTINGS, "generate-video")).toBe(false);
    expect(toolShown({ ...DEFAULT_SETTINGS, showVideo: true }, "generate-video")).toBe(true);
    expect(toolShown(DEFAULT_SETTINGS, "shape-rect")).toBe(true);
    expect(toolShown({ ...DEFAULT_SETTINGS, showRect: false }, "shape-rect")).toBe(false);
    expect(toolShown(DEFAULT_SETTINGS, "generate-image")).toBe(true);
    expect(toolShown(DEFAULT_SETTINGS, "pointer")).toBe(true);
    expect(toolShown(DEFAULT_SETTINGS, "frame")).toBe(true);
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
    expect(readSettings({ linkStyle: "link-straight", showNodeNames: false, showLine: true, other: 1 })).toEqual({
      ...DEFAULT_SETTINGS,
      linkStyle: "link-straight",
      showNodeNames: false,
      showLine: true,
    });
    expect(readSettings({ showVideo: "yes" })).toEqual(DEFAULT_SETTINGS);
    expect(readSettings({ showNodeNames: "no" })).toEqual(DEFAULT_SETTINGS);
    expect(readSettings({ linkStyle: "nope" })).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(readSettings([1, 2])).toEqual(DEFAULT_SETTINGS);
  });

  it("knows when everything is at its default", () => {
    expect(isDefault(DEFAULT_SETTINGS)).toBe(true);
    expect(isDefault({ ...DEFAULT_SETTINGS, linkStyle: "link-elbow" })).toBe(false);
    expect(isDefault({ ...DEFAULT_SETTINGS, showNodeNames: false })).toBe(false);
    expect(isDefault({ ...DEFAULT_SETTINGS, showVideo: true })).toBe(false);
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

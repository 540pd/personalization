/**
 * The user's settings (#214), as data.
 *
 * Same move as the rail's items.ts: one place a setting is enumerated, and
 * the Settings page draws itself from it. Adding a setting is one entry here
 * (plus its value in `Settings` and `DEFAULT_SETTINGS`) and the code that
 * reads it.
 *
 * Preferences of the person, not content of a board: they live in their own
 * storage key and never in the board's saved state or a board file.
 */

import type { LinkStyle } from "@/lib/canvas/wires";
import type { Tool } from "@/store/tool.store";

export interface Settings {
  linkStyle: LinkStyle;
  /** Off: a name shows only on a hovered or selected node (#215). */
  showNodeNames: boolean;
  // Which items the dock's Create and Shapes menus offer (#404). Image has no
  // switch: it is always in the Create menu.
  showVideo: boolean;
  showPrompt: boolean;
  showCompose: boolean;
  showRect: boolean;
  showArrow: boolean;
  showLine: boolean;
  showEllipse: boolean;
  showTriangle: boolean;
  showBlockArrow: boolean;
  showDiamond: boolean;
}

export type SettingId = keyof Settings;

export const DEFAULT_SETTINGS: Settings = {
  // Curve was the only fallback before there was a setting.
  linkStyle: "link-curve",
  showNodeNames: true,
  // The menus' defaults come from the request in
  // docs/sidebar/playspace_settings_implementation_changes.md (#404).
  showVideo: false,
  showPrompt: true,
  showCompose: true,
  showRect: true,
  showArrow: true,
  showLine: false,
  showEllipse: false,
  showTriangle: false,
  showBlockArrow: false,
  showDiamond: true,
};

export interface ChoiceOption<V extends string = string> {
  value: V;
  label: string;
}

export type SettingSpec =
  | {
      id: SettingId;
      group: string;
      label: string;
      help: string;
      type: "choice";
      options: ChoiceOption[];
    }
  | {
      id: SettingId;
      group: string;
      label: string;
      /** Optional: a row that only names a menu item needs none. */
      help?: string;
      type: "toggle";
      /** The dock item this switch shows or hides (#404). */
      tool?: Tool;
    };

/** A switch that shows or hides one of the dock's menu items (#404). */
function menuItem(id: SettingId, group: string, label: string, tool: Tool): SettingSpec {
  return { id, group, label, type: "toggle", tool };
}

export interface GroupInfo {
  /** A line under the group's heading. */
  help?: string;
  /** Show "N of M shown", counting `always` items that have no switch. */
  count?: { always: number };
  /** Shown in the group's card while every switch in it is off. */
  allOffNotice?: string;
}

/** What a group shows besides its rows; a group not listed has only a heading. */
export const GROUP_INFO: Record<string, GroupInfo> = {
  "Create menu": {
    help: "Choose what the dock's Create menu offers. Image is always there. Nodes already on a board are not affected.",
    count: { always: 1 },
  },
  "Shapes menu": {
    help: "Choose which shapes the dock's Shapes menu offers. A hidden shape's keyboard shortcut is off too.",
    count: { always: 0 },
    allOffNotice: "No shapes are shown, so the Shapes button is hidden from the dock.",
  },
};

export const SETTINGS: SettingSpec[] = [
  {
    id: "linkStyle",
    group: "Canvas",
    label: "Connection style",
    help: "How links between nodes are drawn, on every board.",
    type: "choice",
    options: [
      { value: "link-curve", label: "Curve" },
      { value: "link-straight", label: "Straight" },
      { value: "link-elbow", label: "Elbow" },
    ],
  },
  {
    id: "showNodeNames",
    group: "Canvas",
    label: "Always show node names",
    help: "Off: a node's name shows only while you hover over or select it. Applies to frame names too.",
    type: "toggle",
  },
  // In the order each menu lists them.
  menuItem("showVideo", "Create menu", "Video", "generate-video"),
  menuItem("showPrompt", "Create menu", "Prompt", "generate-instruction"),
  menuItem("showCompose", "Create menu", "Compose", "generate-compose"),
  menuItem("showRect", "Shapes menu", "Rectangle", "shape-rect"),
  menuItem("showArrow", "Shapes menu", "Arrow", "shape-arrow"),
  menuItem("showLine", "Shapes menu", "Line", "shape-line"),
  menuItem("showEllipse", "Shapes menu", "Ellipse", "shape-ellipse"),
  menuItem("showTriangle", "Shapes menu", "Triangle", "shape-triangle"),
  menuItem("showBlockArrow", "Shapes menu", "Block Arrow", "shape-blockArrow"),
  menuItem("showDiamond", "Shapes menu", "Diamond", "shape-diamond"),
];

/**
 * Does the dock offer this tool? Only the items with a switch can be hidden;
 * every other tool, Image among them, always is.
 */
export function toolShown(settings: Settings, tool: Tool, specs: readonly SettingSpec[] = SETTINGS): boolean {
  const spec = specs.find((s) => s.type === "toggle" && s.tool === tool);
  return spec ? settings[spec.id] === true : true;
}

/** The groups in the order their first setting appears. */
export function settingGroups(specs: readonly SettingSpec[] = SETTINGS): { group: string; specs: SettingSpec[] }[] {
  const groups: { group: string; specs: SettingSpec[] }[] = [];
  for (const spec of specs) {
    const found = groups.find((g) => g.group === spec.group);
    if (found) found.specs.push(spec);
    else groups.push({ group: spec.group, specs: [spec] });
  }
  return groups;
}

/** True when `value` is one `spec` allows. */
export function validValue(spec: SettingSpec, value: unknown): boolean {
  if (spec.type === "toggle") return typeof value === "boolean";
  return typeof value === "string" && spec.options.some((o) => o.value === value);
}

/**
 * Settings from whatever was stored: each known value that is valid, the
 * default for the rest. Unknown keys are dropped. Never throws.
 */
export function readSettings(raw: unknown, specs: readonly SettingSpec[] = SETTINGS): Settings {
  const next: Settings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== "object") return next;
  const values = raw as Record<string, unknown>;
  for (const spec of specs) {
    const value = values[spec.id];
    if (validValue(spec, value)) (next as unknown as Record<string, unknown>)[spec.id] = value;
  }
  return next;
}

export function isDefault(settings: Settings): boolean {
  return (Object.keys(DEFAULT_SETTINGS) as SettingId[]).every((id) => settings[id] === DEFAULT_SETTINGS[id]);
}

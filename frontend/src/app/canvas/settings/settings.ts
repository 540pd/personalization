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

export type LinkStyle = "link-curve" | "link-straight" | "link-elbow";

export interface Settings {
  linkStyle: LinkStyle;
  /** Off: a name shows only on a hovered or selected node (#215). */
  showNodeNames: boolean;
}

export type SettingId = keyof Settings;

export const DEFAULT_SETTINGS: Settings = {
  // Curve was the only fallback before there was a setting.
  linkStyle: "link-curve",
  showNodeNames: true,
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
      help: string;
      type: "toggle";
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
];

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

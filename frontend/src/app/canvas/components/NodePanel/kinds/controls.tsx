"use client";

// The pieces the node kinds share: their settings controls, the empty state,
// the text output, and the fields every generate request carries.

import type { ReactNode } from "react";
import { DEFAULT_NODE_MAX_EDGE } from "@/constants/canvas.constants";
import type { Reference } from "@/types/canvas.types";
import type { MentionContext } from "../../../mentions/mentions";
import type { NodeSettings } from "../nodeKinds";

// A text node is a reading surface, not a picture: a squat landscape box wastes
// the width on short lines, so it defaults taller than it is wide. A Prompt
// node and a Compose box are both this size.
export const TEXT_NODE_SIZE = {
  w: DEFAULT_NODE_MAX_EDGE,
  h: Math.round(DEFAULT_NODE_MAX_EDGE * 0.75),
};

/** The 0–2 Temperature slider in an Advanced section. */
export function TemperatureSlider({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  return (
    <div className="node-panel-temperature">
      <div className="node-panel-temperature-header">
        <p className="node-panel-setting-label">Temperature</p>
        <span className="node-panel-temperature-value">{value.toFixed(1)}</span>
      </div>

      <div className="node-panel-temperature-slider">
        <span className="node-panel-range-label">0</span>
        <input
          type="range"
          aria-label="Temperature"
          min={0}
          max={2}
          step={0.1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="node-panel-range"
        />
        <span className="node-panel-range-label">2</span>
      </div>
    </div>
  );
}

interface SettingSelectProps<T extends string | number> {
  label: string;
  options: readonly T[];
  value: T;
  /** The chosen option's value attribute; the caller converts it back. */
  onChange: (next: string) => void;
  /** What an option reads as, when not its own value ("×3", "4s"). */
  format?: (option: T) => string;
}

/**
 * A settings dropdown: a small label over a field box (#565). One look
 * wherever a kind shows one -- there were two, a labelled box in Advanced and
 * a bare pill in the Options row whose name only a tooltip gave.
 */
export function SettingSelect<T extends string | number>({
  label, options, value, onChange, format,
}: SettingSelectProps<T>) {
  return (
    <div className="setting-select">
      {/* The select carries the name itself, so this is for the eye only. */}
      <span className="setting-select-label" aria-hidden>{label}</span>
      <select
        aria-label={label}
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className="setting-select-box"
      >
        {options.map((o) => (
          <option key={o} value={String(o)}>{format ? format(o) : o}</option>
        ))}
      </select>
    </div>
  );
}

/** A kind's empty state: its icon, and "<noun> will appear here". */
export function KindPlaceholder({ icon, noun }: { icon: ReactNode; noun: string }) {
  return (
    <div className="node-panel-placeholder-content">
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="node-panel-image-icon"
      >
        {icon}
      </svg>

      <span className="node-panel-placeholder-text">
        {noun} will
        <br />
        appear here
      </span>
    </div>
  );
}

// Scrolls inside the node rather than overflowing it: the node is resizable,
// and long output must stay within whatever box the user has dragged.
export function TextOutput({ value }: { value: string }) {
  return <div className="node-panel-text-output">{value}</div>;
}

/**
 * The fields every generate request carries: the references, omitted when
 * there are none, and the prompt's @skills (#240).
 */
/**
 * Whether a request uses the brand (#452): the node's Use brand, absent
 * being on. The backend reads the saved brief and Assets itself (#454).
 */
export function brandRequest(settings: NodeSettings): boolean {
  return (settings as { useBrand?: boolean }).useBrand !== false;
}

export function baseRequest(references: Reference[], context?: MentionContext) {
  return {
    references: references.length ? references : undefined,
    ...(context?.skills ? { skills: context.skills } : {}),
  };
}

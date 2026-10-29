"use client";

// Brand colours, in section 2 of the Assets page (#417): Primary, Secondary
// and Accent, each a swatch (the browser's colour picker) and a hex field,
// plus colours suggested from the logo. A suggestion fills the next empty
// colour.

import { useId, useState } from "react";
import type { BrandColours as Colours } from "@/api/brandAssets.api";
import { cleanColour, isColour } from "../../assets/assetsDraft";

const FIELDS: { key: keyof Colours; label: string; note: string; placeholder: string }[] = [
  { key: "primary", label: "Primary", note: "(recommended)", placeholder: "#1A2B3C" },
  { key: "secondary", label: "Secondary", note: "(optional)", placeholder: "#F4F1EA" },
  { key: "accent", label: "Accent", note: "(optional)", placeholder: "#FF5A1F" },
];

export default function BrandColours({
  colours,
  onChange,
  suggestions,
  flagged,
}: {
  colours: Colours;
  onChange: (key: keyof Colours, value: string) => void;
  /** Colours read from the logo, most used first. */
  suggestions: string[];
  /** Colours Save found wrong: marked even before they are left. */
  flagged: (keyof Colours)[];
}) {
  const id = useId();
  // A field says it is wrong once left, not while it is typed.
  const [left, setLeft] = useState<Partial<Record<keyof Colours, boolean>>>({});
  const used = new Set(Object.values(colours).map(cleanColour));
  const nextEmpty = FIELDS.find((f) => !colours[f.key].trim())?.key;

  return (
    <div className="assets-group" role="group" aria-labelledby={`${id}-title`} id="assets-colours">
      <div>
        <h3 id={`${id}-title`} className="assets-label">
          Brand colours
        </h3>
        <p className="assets-hint">Type a hex value, click a swatch to pick, or use one suggested from your logo.</p>
      </div>

      {suggestions.length > 0 && (
        <div className="assets-suggestions">
          <span>Suggested from your logo:</span>
          {suggestions.map((hex) => (
            <button
              key={hex}
              type="button"
              className="assets-chip"
              aria-label={`Use ${hex}`}
              title={!nextEmpty ? "All three colours are set" : used.has(hex) ? "Already used" : undefined}
              disabled={!nextEmpty || used.has(hex)}
              onClick={() => nextEmpty && onChange(nextEmpty, hex)}
            >
              <span className="assets-chip-swatch" style={{ background: hex }} aria-hidden />
              {hex}
            </button>
          ))}
        </div>
      )}

      <div className="assets-colours">
        {FIELDS.map((f) => {
          const value = colours[f.key];
          const valid = isColour(value);
          const shown = valid ? cleanColour(value) : "";
          const bad = !valid && (!!left[f.key] || flagged.includes(f.key));
          return (
            <div key={f.key} className="assets-field">
              <label htmlFor={`${id}-${f.key}`} className="assets-label-sm">
                {f.label} <span className="assets-muted">{f.note}</span>
              </label>
              <div className={bad ? "assets-colour is-missing" : "assets-colour"}>
                <span className="assets-swatch" style={shown ? { background: shown } : undefined}>
                  <input
                    type="color"
                    aria-label={`Pick ${f.label} colour`}
                    value={(shown || "#000000").toLowerCase()}
                    onChange={(e) => onChange(f.key, e.target.value.toUpperCase())}
                  />
                </span>
                <input
                  id={`${id}-${f.key}`}
                  className="assets-colour-input"
                  placeholder={f.placeholder}
                  spellCheck={false}
                  aria-invalid={bad || undefined}
                  value={value}
                  onChange={(e) => onChange(f.key, e.target.value)}
                  onBlur={() => {
                    setLeft((l) => ({ ...l, [f.key]: true }));
                    // A value that reads as hex is tidied as it is left: "1a2b3c" becomes "#1A2B3C".
                    if (valid && value !== shown) onChange(f.key, shown);
                  }}
                />
              </div>
              {bad && <span className="assets-field-error">Use a hex value like #1A2B3C.</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

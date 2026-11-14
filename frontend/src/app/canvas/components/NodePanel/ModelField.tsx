"use client";

// The model a node runs on, as a field of its form (#562): a label, a box
// showing the chosen model, a line about it, and the menu of the others.
// Props only -- it knows a list of models, not kinds or the store -- and it
// keeps its own open/closed state, so the form that composes it holds none.

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Check, ChevronDown } from "lucide-react";
import { disposeAll, listen } from "@/lib/dom/listen";
import { useDismiss } from "@/lib/dom/useDismiss";

export interface ModelFieldOption {
  id: string;
  label: string;
  /** What the user should know before choosing it; none shows no line. */
  hint?: string;
}

export interface ModelFieldProps {
  models: readonly ModelFieldOption[];
  value: string;
  onChange: (id: string) => void;
  /** Set while the model is the one a mentioned agent runs on (#239). */
  fromAgent?: string | null;
}

const MENU_GAP = 6;
const WINDOW_MARGIN = 16;

/**
 * Where the menu goes: under the trigger, at its width, fixed to the window.
 * Fixed because the form's body scrolls and would clip a menu laid out inside
 * it; so the menu also closes when anything scrolls or the window resizes,
 * rather than float away from its box.
 */
function useMenuBelow(open: boolean, trigger: React.RefObject<HTMLElement | null>, onClose: () => void) {
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open || !trigger.current) return setStyle(null);
    const r = trigger.current.getBoundingClientRect();
    const top = r.bottom + MENU_GAP;
    setStyle({ position: "fixed", left: r.left, top, width: r.width, maxHeight: Math.max(120, window.innerHeight - top - WINDOW_MARGIN) });
    const disposers = [
      listen(window, "scroll", () => close.current(), true),
      listen(window, "resize", () => close.current()),
    ];
    return () => disposeAll(disposers);
  }, [open, trigger]);

  return style;
}

export default function ModelField({ models, value, onChange, fromAgent }: ModelFieldProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const fieldRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useDismiss(open, [fieldRef, menuRef], () => setOpen(false));
  const menuStyle = useMenuBelow(open, triggerRef, () => setOpen(false));

  const current = models.find((m) => m.id === value);

  return (
    <div className="model-field" ref={fieldRef}>
      <p id={`${id}-label`} className="model-field-label">Model</p>

      <button
        ref={triggerRef}
        type="button"
        className="model-field-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-describedby={current?.hint ? `${id}-hint` : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span id={`${id}-value`} className="model-field-value">
          {current?.label ?? value}
          {fromAgent && <span className="model-field-from"> · from @{fromAgent}</span>}
        </span>
        <ChevronDown size={14} aria-hidden className={`model-field-chevron ${open ? "model-field-chevron-open" : ""}`} />
      </button>

      {current?.hint && <p id={`${id}-hint`} className="model-field-hint">{current.hint}</p>}

      {open && menuStyle && (
        <div ref={menuRef} className="model-field-menu" role="listbox" aria-labelledby={`${id}-label`} style={menuStyle}>
          {models.map((m) => (
            <button
              key={m.id}
              type="button"
              role="option"
              aria-selected={m.id === value}
              className={`model-field-option ${m.id === value ? "model-field-option-current" : ""}`}
              onClick={() => {
                onChange(m.id);
                setOpen(false);
              }}
            >
              <span>{m.label}</span>
              {m.id === value && <Check size={13} aria-hidden className="model-field-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

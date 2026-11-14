"use client";

// A part of a form that is closed until asked for (#565): a trigger with an
// icon, a label and a chevron, and whatever it is given underneath. It keeps
// its own open state and knows nothing of what it holds, so the form that
// composes it holds neither.

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

export interface AdvancedSectionProps {
  label?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export default function AdvancedSection({ label = "Advanced settings", defaultOpen = false, children }: AdvancedSectionProps) {
  const id = useId();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="advanced-section">
      <button
        type="button"
        className="advanced-section-trigger"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <SlidersHorizontal size={14} aria-hidden className="advanced-section-icon" />
        <span className="advanced-section-label">{label}</span>
        <ChevronDown size={14} aria-hidden className={`advanced-section-chevron ${open ? "advanced-section-chevron-open" : ""}`} />
      </button>
      {open && <div id={id}>{children}</div>}
    </div>
  );
}

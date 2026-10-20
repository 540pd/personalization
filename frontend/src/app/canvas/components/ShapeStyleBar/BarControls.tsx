"use client";

// The style bar's controls: a button with its tooltip, a button that opens a
// card of options, and the options themselves.

import type { ReactNode } from "react";

/** A button that acts at once, with its tooltip and an optional key. */
export function BarButton({
  label, tooltip, kbd, pressed, disabled, onClick, children,
}: {
  label: string;
  /** Defaults to the label. */
  tooltip?: ReactNode;
  kbd?: string;
  /** A toggle (Bold, Italic): lit, and aria-pressed, while on. */
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div className="shape-style-wrapper">
      <button
        type="button" aria-label={label} aria-pressed={pressed} disabled={disabled}
        onClick={onClick}
        className={pressed === undefined ? "shape-style-button"
          : ["shape-style-button", pressed ? "shape-style-button-on" : ""].join(" ")}
      >
        {children}
      </button>
      <span className="shape-style-tooltip">
        {tooltip ?? label}{kbd && <> <kbd className="shape-style-kbd">{kbd}</kbd></>}
      </span>
    </div>
  );
}

/**
 * A button that opens a card of options above it, in place of its tooltip.
 * Which card is open is the bar's `card` state, so opening one closes the
 * others.
 */
export function BarMenu({
  label, tooltip, open, onToggle, className, cardClassName = "shape-style-row", cardLabel, icon, children,
}: {
  label: string;
  tooltip: string;
  open: boolean;
  onToggle: () => void;
  /** Extra classes for the button. */
  className?: string;
  cardClassName?: string;
  cardLabel: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const btn = ["shape-style-button", open ? "shape-style-button-open" : ""].join(" ");
  return (
    <div className="shape-style-wrapper">
      <button
        type="button" aria-label={label} aria-expanded={open}
        onClick={onToggle} className={className ? `${btn} ${className}` : btn}
      >
        {icon}
      </button>
      {!open && <span className="shape-style-tooltip">{tooltip}</span>}
      {open && (
        <div className={`shape-style-card ${cardClassName}`} role="group" aria-label={cardLabel}>
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * A card's options, one aria-pressed button each, the current one marked.
 * `name` is each option's accessible name and `title` its hover text, which
 * defaults to the name.
 */
export function OptionCard<T>({
  options, isCurrent, name, title = name, onPick, className, children,
}: {
  options: readonly T[];
  isCurrent: (option: T) => boolean;
  name: (option: T) => string;
  title?: (option: T) => string;
  onPick: (option: T) => void;
  /** Extra classes for each option. */
  className?: string;
  children: (option: T) => ReactNode;
}) {
  return options.map((o) => (
    <button
      key={name(o)} type="button" title={title(o)} aria-label={name(o)}
      aria-pressed={isCurrent(o)}
      onClick={() => onPick(o)}
      className={[className ? `shape-style-option ${className}` : "shape-style-option", isCurrent(o) ? "shape-style-option-current" : ""].join(" ")}
    >
      {children(o)}
    </button>
  ));
}

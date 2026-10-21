"use client";

// The dock's building blocks: a button with its tooltip, a button that opens
// a submenu, and a submenu's item.

import { useRef, type ReactNode } from "react";
import Tooltip from "@/components/Tooltip";
import { useDismiss } from "@/lib/dom/useDismiss";

// A pill above the button: its label and, if it has one, its shortcut.
const tip = (label: string, shortcut?: string) => (
  <>
    <span className="floating-dock-tooltip-label">{label}</span>
    {shortcut && <span className="floating-dock-tooltip-shortcut">{shortcut}</span>}
  </>
);

export const btnClass = (active: boolean) =>
  [
    "floating-dock-button",
    active ? "floating-dock-button-active" : "floating-dock-button-inactive",
  ].join(" ");

const submenuItemClass = (active: boolean) =>
  [
    "floating-dock-submenu-item",
    active
      ? "floating-dock-submenu-item-active"
      : "floating-dock-submenu-item-inactive",
  ].join(" ");

/**
 * A dock button that acts at once, or arms a tool, with its tooltip. The
 * button is named by `ariaLabel`, or else by its label: it is only an icon.
 */
export function DockButton({
  label, ariaLabel, shortcut, className, pressed, tabIndex, onClick, children,
}: {
  label: string;
  ariaLabel?: string;
  shortcut?: string;
  className: string;
  pressed?: boolean;
  tabIndex?: number;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip variant="pill" className="floating-dock-tool-wrapper" bubbleClassName="floating-dock-tooltip" content={tip(label, shortcut)}>
      <button
        title=""
        aria-label={ariaLabel ?? label}
        tabIndex={tabIndex}
        onClick={onClick}
        aria-pressed={pressed}
        className={className}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/**
 * A dock button that opens a submenu above it. The tooltip gives way to the
 * menu while it is open, and a press anywhere outside the two closes it.
 *
 * `state` says how the button reports itself: a tool menu is "pressed" while
 * open or while one of its tools is armed, and the e2e specs find dock
 * buttons by `[aria-pressed]`, so a menu that arms nothing (Color) reports
 * "expanded" instead and stays out of that count.
 */
export function DockMenu({
  label, shortcut, icon, open, active = false, state = "pressed", ariaLabel,
  onToggle, onClose, menuClassName = "floating-dock-submenu", fitContent = true,
  role, menuLabel, children,
}: {
  label: string;
  shortcut?: string;
  icon: ReactNode;
  open: boolean;
  /** One of the menu's tools is armed. */
  active?: boolean;
  state?: "pressed" | "expanded";
  ariaLabel?: string;
  onToggle: () => void;
  onClose: () => void;
  menuClassName?: string;
  /** As wide as its widest item; the Color card sets its own width. */
  fitContent?: boolean;
  role?: string;
  menuLabel?: string;
  children: ReactNode;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismiss(open, [btnRef, menuRef], onClose);

  return (
    <Tooltip
      variant="pill" className="floating-dock-tool-wrapper" bubbleClassName="floating-dock-tooltip"
      // The menu takes the tooltip's place while it is open.
      content={open ? "" : tip(label, shortcut)}
    >
      <button
        ref={btnRef}
        title=""
        aria-label={ariaLabel ?? label}
        aria-expanded={state === "expanded" ? open : undefined}
        onClick={onToggle}
        aria-pressed={state === "pressed" ? active || open : undefined}
        className={btnClass(active || open)}
      >
        {icon}
      </button>

      {open && (
        <div
          ref={menuRef}
          className={menuClassName}
          style={fitContent ? { width: "max-content" } : undefined}
          role={role}
          aria-label={menuLabel}
        >
          {children}
        </div>
      )}
    </Tooltip>
  );
}

/** One item in a dock submenu. */
export function DockMenuItem({
  icon, label, shortcut, active, onClick,
}: {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={submenuItemClass(active)}>
      {icon}
      <span>{label}</span>
      {shortcut && (
        <span className="floating-dock-submenu-shortcut">
          {shortcut}
        </span>
      )}
    </button>
  );
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import "./Tooltip.scss";

interface TooltipProps {
  content: string;
  children: ReactNode;
  /** Extra classes for the anchor, which wraps the children. */
  className?: string;
}

/**
 * A label that opens to the right of its children on hover and on keyboard
 * focus, after a short delay. Escape hides it until the pointer or focus
 * leaves.
 *
 * Shown by CSS (`:hover`, `:has(:focus-visible)`) rather than by mouse
 * events, because it has to work on disabled buttons -- a "coming soon" item
 * is exactly what needs explaining -- and a disabled control does not
 * reliably deliver mouse events, which is also why a native `title` on one
 * is unreliable. CSS hover applies to it regardless.
 *
 * Empty `content` renders no bubble but keeps the anchor, so a caller can
 * switch the tooltip off without changing the tree -- which would remount the
 * children and drop their focus.
 *
 * The bubble is aria-hidden: it repeats the child's accessible name, which
 * stays on the child itself, so a screen reader would hear it twice.
 */
export default function Tooltip({ content, children, className }: TooltipProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDismissed(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <span
      className={["tooltip-anchor", className].filter(Boolean).join(" ")}
      data-dismissed={dismissed || undefined}
      onMouseLeave={() => setDismissed(false)}
      onBlur={() => setDismissed(false)}
    >
      {children}
      {content && (
        <span className="tooltip" aria-hidden>
          {content}
        </span>
      )}
    </span>
  );
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { listen } from "@/lib/dom/listen";
import "./Tooltip.scss";

interface TooltipProps {
  /** What the bubble says; empty shows none (see below). */
  content: ReactNode;
  children: ReactNode;
  /** Extra classes for the anchor, which wraps the children. */
  className?: string;
  /**
   * "label": dark, beside its control, after a short delay -- the rail.
   * "pill": white, above its control, at once -- the dock and the style bar,
   * whose buttons are used in quick succession. A pill's place and look come
   * from its toolbar, through `bubbleClassName`.
   */
  variant?: "label" | "pill";
  /** Extra classes for the bubble. */
  bubbleClassName?: string;
}

/**
 * A label that opens on hover and on keyboard focus. Escape hides it until
 * the pointer or focus leaves.
 *
 * Shown by CSS (`:hover`, `:has(:focus-visible)`) rather than by mouse
 * events, because it has to work on disabled buttons -- a "coming soon" item
 * is exactly what needs explaining -- and a disabled control does not
 * reliably deliver mouse events, which is also why a native `title` on one
 * is unreliable. CSS hover applies to it regardless.
 *
 * Empty `content` renders no bubble but keeps the anchor, so a caller can
 * switch the tooltip off without changing the tree -- which would remount the
 * children and drop their focus. A menu button does this while its menu is
 * open.
 *
 * The bubble is aria-hidden: it repeats the child's accessible name, which
 * stays on the child itself, so a screen reader would hear it twice. The
 * child must therefore have a name of its own -- an icon button its
 * aria-label. The dock's buttons once had none: the pill was their only
 * label, hidden until hovered, so a screen reader announced "button".
 */
export default function Tooltip({ content, children, className, variant = "label", bubbleClassName }: TooltipProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(
    () => listen(window, "keydown", (e) => {
      if (e.key === "Escape") setDismissed(true);
    }),
    [],
  );

  const Anchor = variant === "pill" ? "div" : "span";
  const bubble = variant === "pill" ? "tooltip-pill" : "tooltip";
  return (
    <Anchor
      className={["tooltip-anchor", className].filter(Boolean).join(" ")}
      data-dismissed={dismissed || undefined}
      onMouseLeave={() => setDismissed(false)}
      onBlur={() => setDismissed(false)}
    >
      {children}
      {content ? (
        <span className={[bubble, bubbleClassName].filter(Boolean).join(" ")} aria-hidden>
          {content}
        </span>
      ) : null}
    </Anchor>
  );
}

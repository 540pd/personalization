"use client";

import { useEffect, useRef, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { disposeAll, listen } from "@/lib/dom/listen";
import { MENU_ITEM, menuKeyboard } from "./menuKeyboard";

/**
 * The rail's menu surface (.playspace-menu, .sidebar-item rows), portaled
 * and fixed at `style`: the Playspace options (#197) and a library row's ⋯
 * (#210). A press outside it closes it, except on `anchor`, whose trigger
 * toggles the menu itself.
 */
export default function PortalMenu({
  anchor,
  label,
  style,
  onClose,
  closeOnScroll = false,
  onClick,
  children,
}: {
  anchor: HTMLElement;
  label: string;
  style: CSSProperties;
  /** `restoreFocus` is false when focus is about to go somewhere else on purpose. */
  onClose: (restoreFocus: boolean) => void;
  /** For a menu placed under something that scrolls. */
  closeOnScroll?: boolean;
  onClick?: (e: MouseEvent) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = menuKeyboard(ref, onClose);

  // Keyboard focus starts on the first enabled item; with none enabled, on
  // the menu itself, so arrow keys and Escape still land here.
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>(MENU_ITEM);
    (first ?? ref.current)?.focus();
  }, []);

  useEffect(() => {
    const disposers = [
      listen(document, "mousedown", (e) => {
        const target = e.target as Node;
        if (ref.current?.contains(target) || anchor.contains(target)) return;
        onClose(false);
      }),
    ];
    // A scrolled page would leave the menu floating away from its row.
    if (closeOnScroll) disposers.push(listen(window, "scroll", () => onClose(false), true));
    return () => disposeAll(disposers);
  }, [anchor, onClose, closeOnScroll]);

  return createPortal(
    <div
      ref={ref}
      className="playspace-menu"
      role="menu"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onClick={onClick}
      style={style}
    >
      {children}
    </div>,
    document.body,
  );
}

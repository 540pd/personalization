"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { useSidebar, sidebarInset } from "@/store/sidebar.store";
import { useSection } from "@/store/section.store";
import { Z_INDEX } from "@/constants/canvas.constants";
import { dialogIsOpen, isPageKey } from "@/lib/dom/keys";
import { listen } from "@/lib/dom/listen";
import Tooltip from "@/components/Tooltip";
import "./Library.scss";

const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

/**
 * A rail destination's page -- Skills (#206), Agents (#208) -- shown over the
 * board rather than instead of it, so the board stays mounted exactly as it
 * was while its shortcuts and file drop stand down (section.store).
 */
export default function LibraryPage({
  title,
  subtitle,
  action,
  onFileDrop,
  closable = false,
  children,
}: {
  title: string;
  subtitle: string;
  /** The header's button; hidden by the caller while the empty state shows its own. */
  action?: ReactNode;
  /** A file dropped anywhere on the page. Without it, drops do nothing. */
  onFileDrop?: (file: File) => void;
  /**
   * A page opened from the user menu, which has no rail item to leave by
   * (#405): a close button in the header, and Esc.
   */
  closable?: boolean;
  children: ReactNode;
}) {
  const collapsed = useSidebar((s) => s.collapsed);
  const [dropping, setDropping] = useState(false);
  // Content under the pinned title row: it shows a divider (#405).
  const [scrolled, setScrolled] = useState(false);
  const dragDepth = useRef(0);
  const pageRef = useRef<HTMLDivElement>(null);
  const titleId = `library-${title.toLowerCase()}-title`;

  // Arriving on the page puts focus in it, so keys land here and a screen
  // reader announces where it is.
  useEffect(() => {
    pageRef.current?.focus();
  }, []);

  // Esc closes the page, but not from a field (a half-typed Brand value), a
  // dialog, or an open menu: there it keeps its usual meaning.
  useEffect(() => {
    if (!closable) return;
    return listen(window, "keydown", (e) => {
      if (e.key !== "Escape" || e.defaultPrevented || !isPageKey(e)) return;
      if (dialogIsOpen() || document.querySelector('[role="menu"]')) return;
      useSection.getState().closePage();
    });
  }, [closable]);

  return (
    <div
      ref={pageRef}
      className={dropping ? "library-page library-page-dropping" : "library-page"}
      style={{ left: sidebarInset(collapsed), zIndex: Z_INDEX.page }}
      tabIndex={-1}
      role="region"
      aria-labelledby={titleId}
      onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
      // Own the drag while it is over the page. Board's window handler would
      // otherwise answer dragover with dropEffect "none".
      onDragEnter={(e) => {
        if (!isFileDrag(e) || !onFileDrop) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDropping(true);
      }}
      onDragOver={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = onFileDrop ? "copy" : "none";
      }}
      onDragLeave={(e) => {
        if (!isFileDrag(e)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDropping(false);
      }}
      onDrop={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        dragDepth.current = 0;
        setDropping(false);
        const dropped = e.dataTransfer.files[0];
        if (dropped && onFileDrop) onFileDrop(dropped);
      }}
    >
      {/* The title row stays pinned while the page scrolls, so its action
          and the close button are always in reach (#405). A direct child
          of the page: sticky holds only as long as its parent is on screen. */}
      <header className={scrolled ? "library-header is-scrolled" : "library-header"}>
        <h1 id={titleId} className="library-title">
          {title}
        </h1>
        {action}
        {closable && (
          <Tooltip content="Close (Esc)" className="library-close-anchor" bubbleClassName="library-close-tip">
            <button
              type="button"
              className="library-close"
              aria-label={`Close ${title}`}
              onClick={() => useSection.getState().closePage()}
            >
              <X size={18} aria-hidden />
            </button>
          </Tooltip>
        )}
      </header>
      <p className="library-subtitle">{subtitle}</p>
      {children}
    </div>
  );
}

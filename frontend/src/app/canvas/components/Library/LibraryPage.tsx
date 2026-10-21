"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSidebar, sidebarInset } from "@/store/sidebar.store";
import { Z_INDEX } from "@/constants/canvas.constants";
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
  children,
}: {
  title: string;
  subtitle: string;
  /** The header's button; hidden by the caller while the empty state shows its own. */
  action?: ReactNode;
  /** A file dropped anywhere on the page. Without it, drops do nothing. */
  onFileDrop?: (file: File) => void;
  children: ReactNode;
}) {
  const collapsed = useSidebar((s) => s.collapsed);
  const [dropping, setDropping] = useState(false);
  const dragDepth = useRef(0);
  const pageRef = useRef<HTMLDivElement>(null);
  const titleId = `library-${title.toLowerCase()}-title`;

  // Arriving on the page puts focus in it, so keys land here and a screen
  // reader announces where it is.
  useEffect(() => {
    pageRef.current?.focus();
  }, []);

  return (
    <div
      ref={pageRef}
      className={dropping ? "library-page library-page-dropping" : "library-page"}
      style={{ left: sidebarInset(collapsed), zIndex: Z_INDEX.page }}
      tabIndex={-1}
      role="region"
      aria-labelledby={titleId}
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
      <header className="library-header">
        <div className="library-header-text">
          <h1 id={titleId} className="library-title">
            {title}
          </h1>
          <p className="library-subtitle">{subtitle}</p>
        </div>
        {action}
      </header>
      {children}
    </div>
  );
}

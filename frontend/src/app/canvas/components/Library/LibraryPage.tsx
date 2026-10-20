"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Search } from "lucide-react";
import { useSidebar, sidebarInset } from "@/store/sidebar.store";
import { Z_INDEX } from "@/constants/canvas.constants";
import RowMenu, { type RowMenuItem } from "./RowMenu";
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

/** The header's (or the empty state's) primary button. */
export function LibraryAction({
  label,
  icon,
  onClick,
  buttonRef,
  inEmpty = false,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  buttonRef: RefObject<HTMLButtonElement | null>;
  inEmpty?: boolean;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={inEmpty ? "library-action-button library-empty-button" : "library-action-button"}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

export function LibraryEmpty({
  icon,
  title,
  text,
  action,
  hint,
  footer,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action: ReactNode;
  hint?: string;
  /** In place of `hint`, when the line under the button holds a control. */
  footer?: ReactNode;
}) {
  return (
    <div className="library-empty">
      <span className="library-empty-icon" aria-hidden>
        {icon}
      </span>
      <p className="library-empty-title">{title}</p>
      <p className="library-empty-text">{text}</p>
      {action}
      {footer ?? (hint && <p className="library-empty-hint">{hint}</p>)}
    </div>
  );
}

/** Search, tag chips (All + each tag, one at a time) and the match count. */
export function LibraryToolbar({
  query,
  onQuery,
  searchLabel,
  tags,
  tag,
  onTag,
  count,
}: {
  query: string;
  onQuery: (q: string) => void;
  searchLabel: string;
  tags: string[];
  tag: string | null;
  onTag: (tag: string | null) => void;
  /** Already worded: "4 skills", "1 agent". */
  count: string;
}) {
  return (
    <div className="library-toolbar">
      <div className="library-search">
        <Search size={14} aria-hidden />
        <input
          type="search"
          className="library-search-input"
          placeholder="Search name or description"
          aria-label={searchLabel}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </div>
      {tags.length > 0 && (
        <div className="library-tag-filter" role="group" aria-label="Filter by tag">
          <span className="library-tag-filter-label" aria-hidden>
            Tags
          </span>
          <button
            type="button"
            className={tag === null ? "library-filter-chip library-filter-chip-on" : "library-filter-chip"}
            aria-pressed={tag === null}
            onClick={() => onTag(null)}
          >
            All
          </button>
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              className={tag === t ? "library-filter-chip library-filter-chip-on" : "library-filter-chip"}
              aria-pressed={tag === t}
              onClick={() => onTag(tag === t ? null : t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      <span className="library-count" aria-live="polite">
        {count}
      </span>
    </div>
  );
}

export function LibraryNoMatch({ noun, onClear }: { noun: string; onClear: () => void }) {
  return (
    <div className="library-no-match">
      <p>No {noun} match</p>
      <button type="button" className="board-confirm-cancel" onClick={onClear}>
        Clear filters
      </button>
    </div>
  );
}

/**
 * A table row you can open (#210): a click anywhere but its ⋯ menu, or Enter
 * while the row itself has focus, calls `onOpen` with the row -- where focus
 * goes back to once whatever it opened closes.
 */
export function LibraryRow({
  id,
  label,
  onOpen,
  menu,
  children,
}: {
  /** The item's id; focus finds the next row by it after a removal (#211). */
  id: string;
  /** The item's name, for the row's and the menu's accessible names. */
  label: string;
  onOpen: (from: HTMLElement) => void;
  menu: RowMenuItem[];
  children: ReactNode;
}) {
  return (
    <tr
      className="library-row"
      data-item-id={id}
      tabIndex={0}
      aria-label={`${label}, open to edit`}
      onClick={(e) => onOpen(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key !== "Enter" || e.target !== e.currentTarget) return;
        e.preventDefault();
        onOpen(e.currentTarget);
      }}
    >
      {children}
      <td className="library-cell-actions">
        <RowMenu label={label} items={menu} />
      </td>
    </tr>
  );
}

/** The header cell over the rows' ⋯ menus. */
export function ActionsHeader() {
  return (
    <th scope="col">
      <span className="sr-only">Actions</span>
    </th>
  );
}

/** Where focus goes back to once a dialog opened from the page closes. */
export function useReturnFocus(fallback: RefObject<HTMLElement | null>) {
  const target = useRef<HTMLElement | null>(null);
  return {
    from: (el: HTMLElement | null) => {
      target.current = el;
    },
    restore: () =>
      // After the dialog has gone, and the empty state may have become a table.
      requestAnimationFrame(() => (target.current?.isConnected ? target.current : fallback.current)?.focus()),
  };
}

export function TagsCell({ tags }: { tags: string[] }) {
  return tags.length ? (
    <span className="library-cell-tags">
      {tags.map((t) => (
        <span key={t} className="library-tag">
          {t}
        </span>
      ))}
    </span>
  ) : (
    <span className="library-cell-none" aria-label="No tags">
      —
    </span>
  );
}

/**
 * Query and tag filter state, with the tag dropped once no item has it any
 * more -- a filter on it would match nothing, silently.
 */
export function useLibraryFilters(tags: string[]) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  useEffect(() => {
    if (tag && !tags.includes(tag)) setTag(null);
  }, [tag, tags]);
  return {
    query,
    setQuery,
    tag,
    setTag,
    clear: () => {
      setQuery("");
      setTag(null);
    },
  };
}

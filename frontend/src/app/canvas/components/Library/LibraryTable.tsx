"use client";

import { Fragment, type ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import RowMenu, { type RowMenuItem } from "./RowMenu";
import type { Listed } from "../../library/fields";

export interface LibraryColumn<T> {
  header: string;
  /** The <col>'s class, which sets the column's width. */
  col: string;
  /** The row's <td>. */
  cell: (item: T) => ReactNode;
}

/**
 * A library's table (#206, #208): sorted by its first column, each row opening
 * Edit (#210), with Edit…, any `extraMenu` items, and Remove… (#211) in its ⋯ menu.
 */
export default function LibraryTable<T extends Listed>({
  className,
  columns,
  rows,
  onEdit,
  onRemove,
  extraMenu,
}: {
  /** Added to .library-table. */
  className?: string;
  columns: LibraryColumn<T>[];
  rows: readonly T[];
  onEdit: (item: T, from: HTMLElement) => void;
  onRemove: (item: T, trigger: HTMLElement) => void;
  /** Between Edit… and Remove…: Agents' Duplicate. */
  extraMenu?: (item: T) => RowMenuItem[];
}) {
  return (
    <div className="library-table-wrap">
      <table className={className ? `library-table ${className}` : "library-table"}>
        <colgroup>
          {columns.map((c) => (
            <col key={c.header} className={c.col} />
          ))}
          <col className="library-col-actions" />
        </colgroup>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={c.header} scope="col" aria-sort={i === 0 ? "ascending" : undefined}>
                {c.header}
              </th>
            ))}
            <ActionsHeader />
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <LibraryRow
              key={item.id}
              id={item.id}
              label={item.name}
              onOpen={(from) => onEdit(item, from)}
              menu={[
                { label: "Edit…", icon: Pencil, onSelect: (trigger) => onEdit(item, trigger) },
                ...(extraMenu?.(item) ?? []),
                { label: "Remove…", icon: Trash2, separated: true, onSelect: (trigger) => onRemove(item, trigger) },
              ]}
            >
              {columns.map((c) => (
                <Fragment key={c.header}>{c.cell(item)}</Fragment>
              ))}
            </LibraryRow>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── The table's parts ────────────────────────────────────────────────

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

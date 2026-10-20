"use client";

import { Fragment, type ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { ActionsHeader, LibraryRow } from "./LibraryPage";
import type { RowMenuItem } from "./RowMenu";
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

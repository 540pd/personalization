"use client";

import { type ComponentType, type ReactNode } from "react";
import { Upload } from "lucide-react";
import LibraryPage, { LibraryAction, LibraryEmpty, LibraryNoMatch, LibraryToolbar } from "./LibraryPage";
import LibraryTable, { type LibraryColumn } from "./LibraryTable";
import type { RowMenuItem } from "./RowMenu";
import type { LibraryCollectionState } from "./useLibraryCollection";
import type { Listed } from "../../library/fields";
import type { ItemSaved } from "../../library/itemForm";

/** What a library page's Upload / Edit dialog takes. */
export interface ItemDialogProps<T> {
  editing?: T;
  initialFile?: File;
  onClose: () => void;
  onSaved: (name: string, how: ItemSaved) => void;
  onSaveFailed: () => void;
}

/**
 * A library page (#206, #208): the empty state until there is an item, then
 * search and tags over the table, and the Upload / Edit dialog, Remove…'s
 * confirm and the toast over it all. A file dropped on the page opens Upload
 * with it.
 */
export default function LibraryCollection<T extends Listed>({
  collection,
  title,
  subtitle,
  actionLabel,
  empty,
  tableClassName,
  columns,
  extraMenu,
  Dialog,
}: {
  collection: LibraryCollectionState<T>;
  title: string;
  subtitle: string;
  /** "Upload skill": the header's button, and the empty state's. */
  actionLabel: string;
  empty: { icon: ReactNode; title: string; text: string; hint?: string; footer?: ReactNode };
  tableClassName?: string;
  columns: LibraryColumn<T>[];
  extraMenu?: (item: T) => RowMenuItem[];
  Dialog: ComponentType<ItemDialogProps<T>>;
}) {
  const { items, noun, filters, rows, dialog, open, actionRef } = collection;
  const many = (n: number) => (n === 1 ? `1 ${noun.one}` : `${n} ${noun.many}`);

  const action = (inEmpty: boolean) => (
    <LibraryAction
      label={actionLabel}
      icon={<Upload size={15} aria-hidden />}
      onClick={() => open({ kind: "upload" }, actionRef.current)}
      buttonRef={actionRef}
      inEmpty={inEmpty}
    />
  );

  return (
    <LibraryPage
      title={title}
      subtitle={subtitle}
      action={items.length > 0 ? action(false) : undefined}
      onFileDrop={(file) => !dialog && open({ kind: "upload", file }, actionRef.current)}
    >
      {items.length === 0 ? (
        <LibraryEmpty {...empty} action={action(true)} />
      ) : (
        <>
          <LibraryToolbar
            query={filters.query}
            onQuery={filters.setQuery}
            searchLabel={`Search ${noun.many}`}
            tags={collection.tags}
            tag={filters.tag}
            onTag={filters.setTag}
            count={many(rows.length)}
          />
          {rows.length === 0 ? (
            <LibraryNoMatch noun={noun.many} onClear={filters.clear} />
          ) : (
            <LibraryTable
              className={tableClassName}
              columns={columns}
              rows={rows}
              onEdit={(item, from) => open({ kind: "edit", item }, from)}
              onRemove={(item, trigger) => collection.removal.request(item, trigger)}
              extraMenu={extraMenu}
            />
          )}
        </>
      )}

      {dialog && (
        // A new dialog per item: its fields start from the one being edited.
        <Dialog
          key={dialog.kind === "edit" ? dialog.item.id : "upload"}
          editing={dialog.kind === "edit" ? dialog.item : undefined}
          initialFile={dialog.kind === "upload" ? dialog.file : undefined}
          onClose={collection.close}
          onSaved={collection.saved}
          onSaveFailed={collection.saveFailed}
        />
      )}
      {collection.removal.dialog}
      {collection.toast}
    </LibraryPage>
  );
}

"use client";

// Brand guidelines in section 2 · Brand (#450): the brand's rules as Markdown
// files, for generation to follow. Markdown rather than PDF: plain text the
// model reads as it is, and what it will follow is what the page shows. Each
// file is a row (its name, type, note, size), not a tile: there is no picture.

import { useEffect, useId, useState } from "react";
import { FileText } from "lucide-react";
import { pickFiles } from "@/lib/dom/pickFile";
import { GUIDELINES_DOC_TYPES, editImage, imagesOf, removeImage, type AssetsDraft, type DraftImage } from "../../assets/assetsDraft";
import { useDropZone } from "./AssetTiles";

type Edit = (update: (d: AssetsDraft) => AssetsDraft) => void;

export default function GuidelinesGroup({
  draft,
  onChange,
  onAddFiles,
  onRetry,
  addError,
}: {
  draft: AssetsDraft;
  onChange: Edit;
  onAddFiles: (files: File[]) => void;
  onRetry: (id: string) => void;
  addError: string | null;
}) {
  const id = useId();
  const docs = imagesOf(draft, "guidelines");
  const drop = useDropZone(onAddFiles);
  const add = () => pickFiles(".md,text/markdown", onAddFiles);

  return (
    <div
      className={drop.active ? "assets-group is-dropping" : "assets-group"}
      role="group"
      aria-labelledby={`${id}-title`}
      data-asset-kind="guidelines"
      {...drop.handlers}
    >
      <div>
        <h3 id={`${id}-title`} className="assets-label">
          Brand guidelines <span className="assets-muted">(optional)</span>
        </h3>
        <p className="assets-hint">
          Your brand&apos;s rules as Markdown files: logo use, colours, typography, tone. Generation will follow them.
        </p>
      </div>

      {docs.length > 0 && (
        <ul className="assets-docs" aria-label="Brand guidelines files">
          {docs.map((doc) => (
            <Doc key={doc.asset.id} doc={doc} onChange={onChange} onRetry={onRetry} />
          ))}
        </ul>
      )}

      <div className="assets-docs-add">
        <button type="button" className="assets-pill" onClick={add}>
          + Upload guidelines
        </button>
        <span className="assets-hint">Markdown (.md) · up to 100 KB · export a PDF to Markdown first</span>
      </div>
      {addError && (
        <span className="assets-field-error" role="alert">
          {addError}
        </span>
      )}
    </div>
  );
}

function Doc({ doc, onChange, onRetry }: { doc: DraftImage; onChange: Edit; onRetry: (id: string) => void }) {
  const id = useId();
  const docId = doc.asset.id;
  const [open, setOpen] = useState(false);
  const set = (details: Record<string, string>) => onChange((d) => editImage(d, docId, { details }));
  const remove = () => onChange((d) => removeImage(d, docId));
  const stored = !doc.upload;

  return (
    <li className="assets-doc">
      <div className="assets-doc-row">
        <span className="assets-doc-icon" aria-hidden>
          <FileText size={18} />
        </span>
        <div className="assets-field assets-doc-name">
          <label htmlFor={`${id}-title`} className="assets-label-sm">
            Name
          </label>
          <input
            id={`${id}-title`}
            className="assets-input"
            value={doc.details.title ?? ""}
            placeholder={doc.asset.name}
            onChange={(e) => set({ title: e.target.value })}
          />
        </div>
        <div className="assets-field">
          <label htmlFor={`${id}-type`} className="assets-label-sm">
            Type
          </label>
          <select
            id={`${id}-type`}
            className="assets-input"
            value={doc.details.docType ?? "Brand Guidelines"}
            onChange={(e) => set({ docType: e.target.value })}
          >
            {GUIDELINES_DOC_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="assets-field assets-doc-note">
          <label htmlFor={`${id}-note`} className="assets-label-sm">
            Note <span className="assets-muted">(optional)</span>
          </label>
          <input
            id={`${id}-note`}
            className="assets-input"
            maxLength={200}
            placeholder="2026 edition, replaces the 2024 book"
            value={doc.details.note ?? ""}
            onChange={(e) => set({ note: e.target.value })}
          />
        </div>
      </div>

      <div className="assets-doc-meta">
        <span className="assets-hint">
          {doc.asset.name} · {formatSize(doc.asset.bytes)}
        </span>
        {doc.upload?.state === "uploading" && <span className="assets-hint">Uploading…</span>}
        {doc.upload?.state === "failed" && (
          <>
            <span className="assets-field-error" role="alert">
              {doc.upload.error}
            </span>
            <button type="button" className="assets-link" onClick={() => onRetry(docId)}>
              Retry
            </button>
          </>
        )}
        {stored && (
          <button type="button" className="assets-link" aria-expanded={open} aria-controls={`${id}-preview`} onClick={() => setOpen(!open)}>
            {open ? "Hide preview" : "Preview"}
          </button>
        )}
        <button type="button" className="assets-danger" onClick={remove}>
          Remove
        </button>
      </div>

      {stored && open && <Preview id={`${id}-preview`} url={doc.asset.url} />}
    </li>
  );
}

/** The file as it is stored, as plain text: exactly what generation will read. */
function Preview({ id, url }: { id: string; url: string }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(url)
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
      .then((t) => live && setText(t))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [url]);
  return (
    <pre id={id} className="assets-doc-preview" tabIndex={0} aria-label="Preview">
      {failed ? "Couldn't load the file." : (text ?? "Loading…")}
    </pre>
  );
}

const formatSize = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 102.4) / 10} KB`);

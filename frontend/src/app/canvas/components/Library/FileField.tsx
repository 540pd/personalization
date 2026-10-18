"use client";

import { useState, type ReactNode, type RefObject } from "react";
import { AlertCircle, Upload } from "lucide-react";
import { fileProblem, formatSize } from "../../skills/skillFile";

const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

/**
 * The File field of Upload skill (#206) and Upload agent (#208): a drop zone
 * until a file is chosen, then the file's row -- name, size and `meta` --
 * with a button to pick another. Below it, an error that refused a file, or
 * notes about one that was taken anyway.
 *
 * Dropping is handled by the dialog around it; this only shows the zone lit.
 */
export default function FileField({
  id,
  file,
  icon,
  meta,
  changeLabel,
  error,
  notes = [],
  onPick,
  dropRef,
}: {
  /** Prefix for the field's element ids. */
  id: string;
  file: { name: string; size: number } | null;
  /** Shown beside the chosen file's name. */
  icon: ReactNode;
  /** After the size on the file's second line, e.g. "Gemini 3.8 Flash · 2 skills". */
  meta?: string;
  changeLabel: string;
  error: string | null;
  notes?: string[];
  onPick: () => void;
  /** The drop zone, for the dialog to focus when it opens empty. */
  dropRef?: RefObject<HTMLButtonElement | null>;
}) {
  const [over, setOver] = useState(false);
  const describedBy = [error && `${id}-file-error`, notes.length && `${id}-file-notes`].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <p className="library-field-label" id={`${id}-file-label`}>
        File
      </p>
      {file ? (
        <div className="library-file-chosen">
          <span className="library-file-icon" aria-hidden>
            {icon}
          </span>
          <span className="library-file-text">
            <span className="library-file-name">{file.name}</span>
            <span className="library-file-meta">
              {formatSize(file.size)}
              {meta && ` · ${meta}`}
            </span>
          </span>
          <button type="button" className="library-file-change" aria-describedby={describedBy} onClick={onPick}>
            {changeLabel}
          </button>
        </div>
      ) : (
        <button
          ref={dropRef}
          type="button"
          className={over ? "library-file-drop library-file-drop-over" : "library-file-drop"}
          aria-labelledby={`${id}-file-label ${id}-file-hint`}
          aria-describedby={describedBy}
          onClick={onPick}
          onDragEnter={(e) => isFileDrag(e) && setOver(true)}
          onDragLeave={() => setOver(false)}
          onDrop={() => setOver(false)}
        >
          <Upload size={20} aria-hidden />
          <span id={`${id}-file-hint`} className="library-file-drop-title">
            Choose a .md file or drop it here
          </span>
          <span className="library-file-drop-hint">Markdown only · up to 100 KB</span>
        </button>
      )}
      {error && (
        <p id={`${id}-file-error`} className="library-field-error" role="alert">
          {error}
        </p>
      )}
      {!error && notes.length > 0 && (
        <div id={`${id}-file-notes`} role="status">
          {notes.map((note) => (
            <p key={note} className="library-field-note">
              <AlertCircle size={14} aria-hidden />
              {note}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export interface ChosenFile {
  name: string;
  size: number;
  content: string;
}

/**
 * Checks and reads a picked file: the markdown rules first, then its text,
 * then `isEmpty` on that text (a skill needs some text; an agent, a body
 * after its front matter). Never throws.
 */
export async function readPickedFile(
  picked: File,
  { tag, isEmpty = (text) => !text.trim() }: { tag: string; isEmpty?: (text: string) => boolean },
): Promise<{ ok: true; file: ChosenFile } | { ok: false; error: string }> {
  const problem = fileProblem(picked);
  if (problem) return { ok: false, error: problem };
  let content: string;
  try {
    content = await picked.text();
  } catch (err) {
    console.warn(`${tag} Could not read ${picked.name}.`, err);
    return { ok: false, error: `Couldn't read ${picked.name}` };
  }
  if (isEmpty(content)) return { ok: false, error: `${picked.name} is empty` };
  return { ok: true, file: { name: picked.name, size: picked.size, content } };
}

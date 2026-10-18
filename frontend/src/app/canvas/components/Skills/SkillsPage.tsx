"use client";

// Luma reference: SKILL-01. The Skills page (#206): every skill in a table,
// and Upload skill.

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Search, Upload } from "lucide-react";
import { useSection } from "@/store/section.store";
import { useSidebar, sidebarInset } from "@/store/sidebar.store";
import { useSkills } from "@/store/skills.store";
import { Z_INDEX } from "@/constants/canvas.constants";
import BoardToast from "../Sidebar/BoardToast";
import UploadSkillDialog from "./UploadSkillDialog";
import { allTags, filterSkills, formatSize, sortByName } from "../../skills/skillFile";
import "./Skills.scss";

const TOAST_MS = 2500;
const ERROR_TOAST_MS = 5000;

interface Toast {
  message: string;
  error?: boolean;
  /** So the same message twice restarts the timer. */
  at: number;
}

const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

const skillsPhrase = (n: number) => (n === 1 ? "1 skill" : `${n} skills`);

/**
 * Shown over the board, not instead of it: the board stays mounted, with its
 * nodes, selection and viewport exactly as they were, and its shortcuts and
 * file drop stand down while this is up (section.store).
 */
export default function SkillsPage() {
  const shown = useSection((s) => s.section === "skills");
  return shown ? <Page /> : null;
}

function Page() {
  const collapsed = useSidebar((s) => s.collapsed);
  const skills = useSkills((s) => s.skills);

  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  // undefined: closed. null: open with no file yet. A File: opened by a drop.
  const [upload, setUpload] = useState<File | null | undefined>(undefined);
  const [toast, setToast] = useState<Toast | null>(null);
  const [dropping, setDropping] = useState(false);
  const dragDepth = useRef(0);
  const pageRef = useRef<HTMLDivElement>(null);
  const uploadButtonRef = useRef<HTMLButtonElement>(null);

  const tags = useMemo(() => allTags(skills), [skills]);
  const rows = useMemo(() => sortByName(filterSkills(skills, query, tag)), [skills, query, tag]);

  // Arriving on the page puts focus in it, so keys land here and a screen
  // reader announces where it is.
  useEffect(() => {
    pageRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.error ? ERROR_TOAST_MS : TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  // A filter on a tag no skill has any more would match nothing, silently.
  useEffect(() => {
    if (tag && !tags.includes(tag)) setTag(null);
  }, [tag, tags]);

  const closeUpload = () => {
    setUpload(undefined);
    // The empty state's button may have just turned into the header's.
    requestAnimationFrame(() => uploadButtonRef.current?.focus());
  };

  const clearFilters = () => {
    setQuery("");
    setTag(null);
  };

  return (
    <div
      ref={pageRef}
      className={dropping ? "skills-page skills-page-dropping" : "skills-page"}
      style={{ left: sidebarInset(collapsed), zIndex: Z_INDEX.page }}
      tabIndex={-1}
      role="region"
      aria-labelledby="skills-title"
      // Own the drag while it is over the page. Board's window handler would
      // otherwise answer dragover with dropEffect "none", and the drop would
      // never fire.
      onDragEnter={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDropping(true);
      }}
      onDragOver={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
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
        if (dropped && upload === undefined) setUpload(dropped);
      }}
    >
      <header className="skills-header">
        <div className="skills-header-text">
          <h1 id="skills-title" className="skills-title">
            Skills
          </h1>
          <p className="skills-subtitle">Reusable instructions you can add to any Prompt panel.</p>
        </div>
        {skills.length > 0 && (
          <button ref={uploadButtonRef} type="button" className="skills-upload-button" onClick={() => setUpload(null)}>
            <Upload size={15} aria-hidden />
            Upload skill
          </button>
        )}
      </header>

      {skills.length === 0 ? (
        <div className="skills-empty">
          <span className="skills-empty-icon" aria-hidden>
            <FileText size={22} />
          </span>
          <p className="skills-empty-title">No skills yet</p>
          <p className="skills-empty-text">
            A skill is a markdown file of instructions, like tone, style or brand rules. Upload one, give it a name and
            tags, then add it to any Prompt panel.
          </p>
          <button ref={uploadButtonRef} type="button" className="skills-upload-button skills-empty-button" onClick={() => setUpload(null)}>
            <Upload size={15} aria-hidden />
            Upload skill
          </button>
          <p className="skills-empty-hint">or drop a .md file here · up to 100 KB</p>
        </div>
      ) : (
        <>
          <div className="skills-toolbar">
            <div className="skills-search">
              <Search size={14} aria-hidden />
              <input
                type="search"
                className="skills-search-input"
                placeholder="Search name or description"
                aria-label="Search skills"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {tags.length > 0 && (
              <div className="skills-tag-filter" role="group" aria-label="Filter by tag">
                <span className="skills-tag-filter-label" aria-hidden>
                  Tags
                </span>
                <button
                  type="button"
                  className={tag === null ? "skills-filter-chip skills-filter-chip-on" : "skills-filter-chip"}
                  aria-pressed={tag === null}
                  onClick={() => setTag(null)}
                >
                  All
                </button>
                {tags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={tag === t ? "skills-filter-chip skills-filter-chip-on" : "skills-filter-chip"}
                    aria-pressed={tag === t}
                    onClick={() => setTag(tag === t ? null : t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
            <span className="skills-count" aria-live="polite">
              {skillsPhrase(rows.length)}
            </span>
          </div>

          {rows.length === 0 ? (
            <div className="skills-no-match">
              <p>No skills match</p>
              <button type="button" className="board-confirm-cancel" onClick={clearFilters}>
                Clear filters
              </button>
            </div>
          ) : (
            <div className="skills-table-wrap">
              <table className="skills-table">
                <colgroup>
                  <col className="skills-col-name" />
                  <col className="skills-col-description" />
                  <col className="skills-col-tags" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col" aria-sort="ascending">
                      Name
                    </th>
                    <th scope="col">Description</th>
                    <th scope="col">Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((skill) => (
                    <tr key={skill.id}>
                      <td>
                        <span className="skills-cell-name">{skill.name}</span>
                        <span className="skills-cell-file">
                          {skill.fileName} · {formatSize(skill.size)}
                        </span>
                      </td>
                      <td className="skills-cell-description" title={skill.description}>
                        {skill.description}
                      </td>
                      <td>
                        {skill.tags.length ? (
                          <span className="skills-cell-tags">
                            {skill.tags.map((t) => (
                              <span key={t} className="skills-tag">
                                {t}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="skills-cell-none" aria-label="No tags">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {upload !== undefined && (
        <UploadSkillDialog
          initialFile={upload ?? undefined}
          onClose={closeUpload}
          onUploaded={(name, replaced) => {
            closeUpload();
            setToast({ message: replaced ? `${name} replaced` : `${name} added`, at: Date.now() });
          }}
          onSaveFailed={() => setToast({ message: "Couldn't save the skill.", error: true, at: Date.now() })}
        />
      )}
      {toast && <BoardToast message={toast.message} error={toast.error} />}
    </div>
  );
}

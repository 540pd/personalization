"use client";

// Luma reference: SKILL-01. The Skills page (#206): every skill in a table,
// and Upload skill.

import { useMemo, useRef, useState } from "react";
import { FileText, Upload } from "lucide-react";
import { useSection } from "@/store/section.store";
import { useSkills } from "@/store/skills.store";
import LibraryPage, {
  LibraryAction,
  LibraryEmpty,
  LibraryNoMatch,
  LibraryToolbar,
  TagsCell,
  useLibraryFilters,
  useLibraryToast,
} from "../Library/LibraryPage";
import UploadSkillDialog from "./UploadSkillDialog";
import { allTags, filterItems, sortByName } from "../../library/fields";
import { formatSize } from "../../skills/skillFile";

const skillsPhrase = (n: number) => (n === 1 ? "1 skill" : `${n} skills`);

export default function SkillsPage() {
  const shown = useSection((s) => s.section === "skills");
  return shown ? <Page /> : null;
}

function Page() {
  const skills = useSkills((s) => s.skills);
  const tags = useMemo(() => allTags(skills), [skills]);
  const filters = useLibraryFilters(tags);
  const rows = useMemo(
    () => sortByName(filterItems(skills, filters.query, filters.tag)),
    [skills, filters.query, filters.tag],
  );
  // undefined: closed. null: open with no file yet. A File: opened by a drop.
  const [upload, setUpload] = useState<File | null | undefined>(undefined);
  const [toast, showToast] = useLibraryToast();
  const actionRef = useRef<HTMLButtonElement>(null);

  const closeUpload = () => {
    setUpload(undefined);
    // The empty state's button may have just turned into the header's.
    requestAnimationFrame(() => actionRef.current?.focus());
  };

  const action = (inEmpty: boolean) => (
    <LibraryAction
      label="Upload skill"
      icon={<Upload size={15} aria-hidden />}
      onClick={() => setUpload(null)}
      buttonRef={actionRef}
      inEmpty={inEmpty}
    />
  );

  return (
    <LibraryPage
      title="Skills"
      subtitle="Reusable instructions you can add to any Prompt panel."
      action={skills.length > 0 ? action(false) : undefined}
      onFileDrop={(file) => upload === undefined && setUpload(file)}
    >
      {skills.length === 0 ? (
        <LibraryEmpty
          icon={<FileText size={22} />}
          title="No skills yet"
          text="A skill is a markdown file of instructions, like tone, style or brand rules. Upload one, give it a name and tags, then add it to any Prompt panel."
          action={action(true)}
          hint="or drop a .md file here · up to 100 KB"
        />
      ) : (
        <>
          <LibraryToolbar
            query={filters.query}
            onQuery={filters.setQuery}
            searchLabel="Search skills"
            tags={tags}
            tag={filters.tag}
            onTag={filters.setTag}
            count={skillsPhrase(rows.length)}
          />
          {rows.length === 0 ? (
            <LibraryNoMatch noun="skills" onClear={filters.clear} />
          ) : (
            <div className="library-table-wrap">
              <table className="library-table">
                <colgroup>
                  <col className="library-col-name" />
                  <col className="library-col-description" />
                  <col className="library-col-tags" />
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
                        <span className="library-cell-name">{skill.name}</span>
                        <span className="library-cell-file">
                          {skill.fileName} · {formatSize(skill.size)}
                        </span>
                      </td>
                      <td className="library-cell-description" title={skill.description}>
                        {skill.description}
                      </td>
                      <td>
                        <TagsCell tags={skill.tags} />
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
            showToast(replaced ? `${name} replaced` : `${name} added`);
          }}
          onSaveFailed={() => showToast("Couldn't save the skill.", true)}
        />
      )}
      {toast}
    </LibraryPage>
  );
}

"use client";

// Luma reference: SKILL-01. The Skills page (#206): every skill in a table,
// Upload skill, and each row opening Edit skill (#210).

import { useMemo, useRef, useState } from "react";
import { FileText, Pencil, Upload } from "lucide-react";
import { useSection } from "@/store/section.store";
import { useSkills } from "@/store/skills.store";
import LibraryPage, {
  ActionsHeader,
  LibraryAction,
  LibraryEmpty,
  LibraryNoMatch,
  LibraryRow,
  LibraryToolbar,
  TagsCell,
  useLibraryFilters,
  useLibraryToast,
  useReturnFocus,
} from "../Library/LibraryPage";
import UploadSkillDialog, { type SkillSaved } from "./UploadSkillDialog";
import { allTags, filterItems, sortByName } from "../../library/fields";
import { formatSize, type Skill } from "../../skills/skillFile";

const skillsPhrase = (n: number) => (n === 1 ? "1 skill" : `${n} skills`);

const SAVED_TOAST: Record<SkillSaved, (name: string) => string> = {
  added: (name) => `${name} added`,
  replaced: (name) => `${name} replaced`,
  saved: (name) => `${name} saved`,
};

/** The dialog over the page: Upload (maybe with a dropped file) or Edit. */
type Dialog = { kind: "upload"; file?: File } | { kind: "edit"; skill: Skill };

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
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [toast, showToast] = useLibraryToast();
  const actionRef = useRef<HTMLButtonElement>(null);
  const focus = useReturnFocus(actionRef);

  const open = (next: Dialog, from: HTMLElement | null) => {
    focus.from(from);
    setDialog(next);
  };
  const close = () => {
    setDialog(null);
    focus.restore();
  };

  const action = (inEmpty: boolean) => (
    <LibraryAction
      label="Upload skill"
      icon={<Upload size={15} aria-hidden />}
      onClick={() => open({ kind: "upload" }, actionRef.current)}
      buttonRef={actionRef}
      inEmpty={inEmpty}
    />
  );

  return (
    <LibraryPage
      title="Skills"
      subtitle="Reusable instructions you can add to any Prompt panel."
      action={skills.length > 0 ? action(false) : undefined}
      onFileDrop={(file) => !dialog && open({ kind: "upload", file }, actionRef.current)}
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
                  <col className="library-col-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col" aria-sort="ascending">
                      Name
                    </th>
                    <th scope="col">Description</th>
                    <th scope="col">Tags</th>
                    <ActionsHeader />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((skill) => (
                    <LibraryRow
                      key={skill.id}
                      label={skill.name}
                      onOpen={(from) => open({ kind: "edit", skill }, from)}
                      menu={[
                        {
                          label: "Edit…",
                          icon: Pencil,
                          onSelect: (trigger) => open({ kind: "edit", skill }, trigger),
                        },
                      ]}
                    >
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
                    </LibraryRow>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {dialog && (
        <UploadSkillDialog
          // A new dialog per skill: its fields start from the one being edited.
          key={dialog.kind === "edit" ? dialog.skill.id : "upload"}
          editing={dialog.kind === "edit" ? dialog.skill : undefined}
          initialFile={dialog.kind === "upload" ? dialog.file : undefined}
          onClose={close}
          onSaved={(name, how) => {
            close();
            showToast(SAVED_TOAST[how](name));
          }}
          onSaveFailed={() => showToast("Couldn't save the skill.", true)}
        />
      )}
      {toast}
    </LibraryPage>
  );
}

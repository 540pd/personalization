"use client";

// Luma reference: SKILL-01. The Skills page (#206): every skill in a table,
// Upload skill, each row opening Edit skill (#210), and Remove… (#211).

import { FileText } from "lucide-react";
import { useSection } from "@/store/section.store";
import { useSkills } from "@/store/skills.store";
import { useAgents } from "@/store/agents.store";
import LibraryCollection from "../Library/LibraryCollection";
import { TagsCell, type LibraryColumn } from "../Library/LibraryTable";
import { useLibraryCollection } from "../Library/useLibraryCollection";
import UploadSkillDialog, { SKILL_NOUN } from "./UploadSkillDialog";
import { sortByName } from "../../library/fields";
import { formatSize, type Skill } from "../../skills/skillFile";

const COLUMNS: LibraryColumn<Skill>[] = [
  {
    header: "Name",
    col: "library-col-name",
    cell: (skill) => (
      <td>
        <span className="library-cell-name">{skill.name}</span>
        <span className="library-cell-file">
          {skill.fileName} · {formatSize(skill.size)}
        </span>
      </td>
    ),
  },
  {
    header: "Description",
    col: "library-col-description",
    cell: (skill) => (
      <td className="library-cell-description" title={skill.description}>
        {skill.description}
      </td>
    ),
  },
  {
    header: "Tags",
    col: "library-col-tags",
    cell: (skill) => (
      <td>
        <TagsCell tags={skill.tags} />
      </td>
    ),
  },
];

export default function SkillsPage() {
  const shown = useSection((s) => s.section === "skills");
  return shown ? <Page /> : null;
}

function Page() {
  const skills = useSkills((s) => s.skills);
  const agents = useAgents((s) => s.agents);
  const collection = useLibraryCollection({
    items: skills,
    noun: SKILL_NOUN,
    // Agents keep the id; it just stops matching, so Undo needs no repair.
    usedBy: (skill) => sortByName(agents.filter((a) => a.skillIds.includes(skill.id))).map((a) => a.name),
    remove: useSkills.getState().remove,
    restore: useSkills.getState().restore,
  });

  return (
    <LibraryCollection
      collection={collection}
      title="Skills"
      subtitle="Reusable instructions you can add to any Prompt panel."
      actionLabel="Upload skill"
      empty={{
        icon: <FileText size={22} />,
        title: "No skills yet",
        text: "A skill is a markdown file of instructions, like tone, style or brand rules. Upload one, give it a name and tags, then add it to any Prompt panel.",
        hint: "or drop a .md file here · up to 100 KB",
      }}
      columns={COLUMNS}
      Dialog={UploadSkillDialog}
    />
  );
}

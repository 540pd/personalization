"use client";

// The Agents page (#208): every agent in a table, Upload agent, each row
// opening Edit agent (#210), and Duplicate / Remove… (#211). Same page as Skills (#206), with a Skills column:
// an agent is a file too.

import { useMemo } from "react";
import { Bot, Copy, Download } from "lucide-react";
import { useSection } from "@/store/section.store";
import { useAgents, type Agent } from "@/store/agents.store";
import { useSkills } from "@/store/skills.store";
import LibraryCollection from "../Library/LibraryCollection";
import { TagsCell, type LibraryColumn } from "../Library/LibraryTable";
import { useLibraryCollection } from "../Library/useLibraryCollection";
import UploadAgentDialog, { AGENT_NOUN } from "./UploadAgentDialog";
import { copyName, newId } from "../../library/fields";
import { agentSkills, downloadExampleAgentFile, modelLabel } from "../../agents/agent";
import type { Skill } from "../../skills/skillFile";

const columns = (skills: readonly Skill[]): LibraryColumn<Agent>[] => [
  {
    header: "Name",
    col: "library-col-name",
    cell: (agent) => (
      <td>
        <span className="library-cell-name">{agent.name}</span>
        <span className="library-cell-file">
          {agent.fileName} · {modelLabel(agent.model)}
        </span>
      </td>
    ),
  },
  {
    header: "Description",
    col: "library-col-description",
    cell: (agent) => (
      <td className="library-cell-description" title={agent.description}>
        {agent.description}
      </td>
    ),
  },
  {
    header: "Skills",
    col: "library-col-skills",
    cell: (agent) => {
      const used = agentSkills(agent, skills);
      return (
        <td>
          {used.length ? (
            <span className="library-cell-tags">
              {used.map((s) => (
                <span key={s.id} className="library-skill-ref">
                  {s.name}
                </span>
              ))}
            </span>
          ) : (
            <span className="library-cell-none" aria-label="No skills">
              —
            </span>
          )}
        </td>
      );
    },
  },
  {
    header: "Tags",
    col: "library-col-tags",
    cell: (agent) => (
      <td>
        <TagsCell tags={agent.tags} />
      </td>
    ),
  },
];

export default function AgentsPage() {
  const shown = useSection((s) => s.section === "agents");
  return shown ? <Page /> : null;
}

function Page() {
  const agents = useAgents((s) => s.agents);
  const skills = useSkills((s) => s.skills);
  const collection = useLibraryCollection({
    items: agents,
    noun: AGENT_NOUN,
    remove: useAgents.getState().remove,
    restore: useAgents.getState().restore,
  });
  const cols = useMemo(() => columns(skills), [skills]);

  // A copy with every field the same, at once -- no dialog.
  const duplicate = (agent: Agent, trigger: HTMLElement) => {
    const name = copyName(agents, agent.name);
    const ok = useAgents.getState().add({ ...agent, id: newId("agent"), name, createdAt: Date.now() });
    collection.showToast(ok ? `${name} created` : `Couldn't duplicate ${agent.name}.`, !ok);
    trigger.focus();
  };

  return (
    <LibraryCollection
      collection={collection}
      title="Agents"
      subtitle="Saved Prompt-panel setups: a role, a model and the skills it uses."
      actionLabel="Upload agent"
      empty={{
        icon: <Bot size={22} />,
        title: "No agents yet",
        text: "An agent is a markdown file: its instructions, plus the model and skills it uses in a short header. Upload one, then pick it in any Prompt panel.",
        footer: (
          <p className="library-empty-hint">
            or drop a .md file here ·{" "}
            <button type="button" className="library-example-link" onClick={downloadExampleAgentFile}>
              <Download size={13} aria-hidden />
              Example agent file
            </button>
          </p>
        ),
      }}
      tableClassName="library-table-agents"
      columns={cols}
      extraMenu={(agent) => [{ label: "Duplicate", icon: Copy, onSelect: (trigger) => duplicate(agent, trigger) }]}
      Dialog={UploadAgentDialog}
    />
  );
}

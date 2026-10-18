"use client";

// The Agents page (#208): every agent in a table, and Upload agent. Same
// page as Skills (#206), with a Skills column: an agent is a file too.

import { useMemo, useRef, useState } from "react";
import { Bot, Download, Upload } from "lucide-react";
import { useSection } from "@/store/section.store";
import { useAgents } from "@/store/agents.store";
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
import UploadAgentDialog from "./UploadAgentDialog";
import { allTags, filterItems, sortByName } from "../../library/fields";
import { agentSkills, downloadExampleAgentFile, modelLabel } from "../../agents/agent";

const agentsPhrase = (n: number) => (n === 1 ? "1 agent" : `${n} agents`);

export default function AgentsPage() {
  const shown = useSection((s) => s.section === "agents");
  return shown ? <Page /> : null;
}

function Page() {
  const agents = useAgents((s) => s.agents);
  const skills = useSkills((s) => s.skills);
  const tags = useMemo(() => allTags(agents), [agents]);
  const filters = useLibraryFilters(tags);
  const rows = useMemo(
    () => sortByName(filterItems(agents, filters.query, filters.tag)),
    [agents, filters.query, filters.tag],
  );
  // undefined: closed. null: open with no file yet. A File: opened by a drop.
  const [upload, setUpload] = useState<File | null | undefined>(undefined);
  const [toast, showToast] = useLibraryToast();
  const actionRef = useRef<HTMLButtonElement>(null);

  const closeDialog = () => {
    setUpload(undefined);
    // The empty state's button may have just turned into the header's.
    requestAnimationFrame(() => actionRef.current?.focus());
  };

  const action = (inEmpty: boolean) => (
    <LibraryAction
      label="Upload agent"
      icon={<Upload size={15} aria-hidden />}
      onClick={() => setUpload(null)}
      buttonRef={actionRef}
      inEmpty={inEmpty}
    />
  );

  return (
    <LibraryPage
      title="Agents"
      subtitle="Saved Prompt-panel setups: a role, a model and the skills it uses."
      action={agents.length > 0 ? action(false) : undefined}
      onFileDrop={(file) => upload === undefined && setUpload(file)}
    >
      {agents.length === 0 ? (
        <LibraryEmpty
          icon={<Bot size={22} />}
          title="No agents yet"
          text="An agent is a markdown file: its instructions, plus the model and skills it uses in a short header. Upload one, then pick it in any Prompt panel."
          action={action(true)}
          footer={
            <p className="library-empty-hint">
              or drop a .md file here ·{" "}
              <button type="button" className="library-example-link" onClick={downloadExampleAgentFile}>
                <Download size={13} aria-hidden />
                Example agent file
              </button>
            </p>
          }
        />
      ) : (
        <>
          <LibraryToolbar
            query={filters.query}
            onQuery={filters.setQuery}
            searchLabel="Search agents"
            tags={tags}
            tag={filters.tag}
            onTag={filters.setTag}
            count={agentsPhrase(rows.length)}
          />
          {rows.length === 0 ? (
            <LibraryNoMatch noun="agents" onClear={filters.clear} />
          ) : (
            <div className="library-table-wrap">
              <table className="library-table library-table-agents">
                <colgroup>
                  <col className="library-col-name" />
                  <col className="library-col-description" />
                  <col className="library-col-skills" />
                  <col className="library-col-tags" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col" aria-sort="ascending">
                      Name
                    </th>
                    <th scope="col">Description</th>
                    <th scope="col">Skills</th>
                    <th scope="col">Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((agent) => {
                    const used = agentSkills(agent, skills);
                    return (
                      <tr key={agent.id}>
                        <td>
                          <span className="library-cell-name">{agent.name}</span>
                          <span className="library-cell-file">
                            {agent.fileName} · {modelLabel(agent.model)}
                          </span>
                        </td>
                        <td className="library-cell-description" title={agent.description}>
                          {agent.description}
                        </td>
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
                        <td>
                          <TagsCell tags={agent.tags} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {upload !== undefined && (
        <UploadAgentDialog
          initialFile={upload ?? undefined}
          onClose={closeDialog}
          onUploaded={(name, replaced) => {
            closeDialog();
            showToast(replaced ? `${name} replaced` : `${name} added`);
          }}
          onSaveFailed={() => showToast("Couldn't save the agent.", true)}
        />
      )}
      {toast}
    </LibraryPage>
  );
}

"use client";

// The Agents page (#208): every agent in a table, Upload agent, each row
// opening Edit agent (#210), and Duplicate / Remove… (#211). Same page as Skills (#206), with a Skills column:
// an agent is a file too.

import { useMemo, useRef, useState } from "react";
import { Bot, Copy, Download, Pencil, Trash2, Upload } from "lucide-react";
import { useSection } from "@/store/section.store";
import { useAgents, type Agent } from "@/store/agents.store";
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
import UploadAgentDialog, { type AgentSaved } from "./UploadAgentDialog";
import { useRemoval } from "../Library/useRemoval";
import { allTags, copyName, filterItems, newId, sortByName } from "../../library/fields";
import { agentSkills, downloadExampleAgentFile, modelLabel } from "../../agents/agent";

const agentsPhrase = (n: number) => (n === 1 ? "1 agent" : `${n} agents`);

const SAVED_TOAST: Record<AgentSaved, (name: string) => string> = {
  added: (name) => `${name} added`,
  replaced: (name) => `${name} replaced`,
  saved: (name) => `${name} saved`,
};

/** The dialog over the page: Upload (maybe with a dropped file) or Edit. */
type Dialog = { kind: "upload"; file?: File } | { kind: "edit"; agent: Agent };

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
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [toast, showToast] = useLibraryToast();
  const actionRef = useRef<HTMLButtonElement>(null);
  const focus = useReturnFocus(actionRef);
  const removal = useRemoval({
    items: agents,
    rows,
    noun: "agents",
    remove: useAgents.getState().remove,
    restore: useAgents.getState().restore,
    showToast,
    emptyFocus: actionRef,
  });

  // A copy with every field the same, at once -- no dialog.
  const duplicate = (agent: Agent, trigger: HTMLElement) => {
    const name = copyName(agents, agent.name);
    const ok = useAgents.getState().add({ ...agent, id: newId("agent"), name, createdAt: Date.now() });
    showToast(ok ? `${name} created` : `Couldn't duplicate ${agent.name}.`, !ok);
    trigger.focus();
  };

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
      label="Upload agent"
      icon={<Upload size={15} aria-hidden />}
      onClick={() => open({ kind: "upload" }, actionRef.current)}
      buttonRef={actionRef}
      inEmpty={inEmpty}
    />
  );

  return (
    <LibraryPage
      title="Agents"
      subtitle="Saved Prompt-panel setups: a role, a model and the skills it uses."
      action={agents.length > 0 ? action(false) : undefined}
      onFileDrop={(file) => !dialog && open({ kind: "upload", file }, actionRef.current)}
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
                  <col className="library-col-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col" aria-sort="ascending">
                      Name
                    </th>
                    <th scope="col">Description</th>
                    <th scope="col">Skills</th>
                    <th scope="col">Tags</th>
                    <ActionsHeader />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((agent) => {
                    const used = agentSkills(agent, skills);
                    return (
                      <LibraryRow
                        key={agent.id}
                        id={agent.id}
                        label={agent.name}
                        onOpen={(from) => open({ kind: "edit", agent }, from)}
                        menu={[
                          {
                            label: "Edit…",
                            icon: Pencil,
                            onSelect: (trigger) => open({ kind: "edit", agent }, trigger),
                          },
                          { label: "Duplicate", icon: Copy, onSelect: (trigger) => duplicate(agent, trigger) },
                          {
                            label: "Remove…",
                            icon: Trash2,
                            separated: true,
                            onSelect: (trigger) => removal.request(agent, trigger),
                          },
                        ]}
                      >
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
                      </LibraryRow>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {dialog && (
        <UploadAgentDialog
          // A new dialog per agent: its fields start from the one being edited.
          key={dialog.kind === "edit" ? dialog.agent.id : "upload"}
          editing={dialog.kind === "edit" ? dialog.agent : undefined}
          initialFile={dialog.kind === "upload" ? dialog.file : undefined}
          onClose={close}
          onSaved={(name, how) => {
            close();
            showToast(SAVED_TOAST[how](name));
          }}
          onSaveFailed={() => showToast("Couldn't save the agent.", true)}
        />
      )}
      {removal.dialog}
      {toast}
    </LibraryPage>
  );
}

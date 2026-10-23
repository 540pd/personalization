import { create } from "zustand";
import { withHandles, type Listed } from "@/app/canvas/library/fields";
import { nameFromFileName } from "@/app/canvas/skills/skillFile";
import { listActions, localList, stringArray, type ListActions } from "@/lib/localList";

/**
 * The user's agents (#208): saved Prompt-panel setups, each uploaded as a
 * markdown file -- its body the instructions, its front matter the model
 * and the skills it always brings.
 *
 * Skills are kept by id, not copied: an agent shows a skill by its current
 * name, and one that no longer exists is simply left out. As with skills,
 * the store only changes once localStorage took the write.
 */

export const AGENTS_STORAGE_KEY = "gcos-agents";

export interface Agent extends Listed {
  /** The file's body, sent ahead of what the user types in the Prompt panel. Text only. */
  instructions: string;
  /** A Prompt-panel model id (instructionKind.models). */
  model: string;
  skillIds: string[];
  fileName: string;
  /** Bytes, as the file reported it. */
  size: number;
  /** The whole file as uploaded, front matter included. */
  content: string;
  createdAt: number;
}

function readAgent(raw: unknown): Agent | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const tags = stringArray(a.tags);
  const skillIds = stringArray(a.skillIds);
  if (
    typeof a.id !== "string" ||
    typeof a.name !== "string" ||
    typeof a.description !== "string" ||
    typeof a.instructions !== "string" ||
    typeof a.model !== "string" ||
    !tags ||
    !skillIds ||
    typeof a.fileName !== "string" ||
    typeof a.size !== "number" ||
    typeof a.content !== "string" ||
    typeof a.createdAt !== "number"
  ) {
    return null;
  }
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    instructions: a.instructions,
    model: a.model,
    skillIds,
    tags,
    fileName: a.fileName,
    size: a.size,
    content: a.content,
    createdAt: a.createdAt,
  };
}

const storage = localList<Agent>({
  key: AGENTS_STORAGE_KEY,
  field: "agents",
  version: 1,
  tag: "[agents]",
  readItem: readAgent,
});

/**
 * The saved agents; [] when there are none or they cannot be read. Never throws.
 * Names saved before #237 come back as handles, and are saved so with the next change.
 */
export const loadAgents = (from?: Storage): Agent[] =>
  withHandles(storage.load(from), (x) => nameFromFileName(x.fileName) || "agent");
/** False when storage refused the write. Never throws. */
export const saveAgents = storage.save;

interface AgentsState extends ListActions<Agent> {
  agents: Agent[];
}

export const useAgents = create<AgentsState>((set, get) => ({
  agents: typeof window === "undefined" ? [] : loadAgents(),
  ...listActions(() => get().agents, saveAgents, (agents) => set({ agents })),
}));

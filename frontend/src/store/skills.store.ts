import { create } from "zustand";
import { withHandles } from "@/app/canvas/library/fields";
import { nameFromFileName, type Skill } from "@/app/canvas/skills/skillFile";
import { localList, stringArray } from "@/lib/localList";

/**
 * The user's skills (#206), kept in localStorage under their own key.
 *
 * The store only changes once the write has gone through, so the Upload
 * dialog can stay open with "Couldn't save the skill." rather than show a
 * skill that a reload would take away.
 */

export const SKILLS_STORAGE_KEY = "gcos-skills";

function readSkill(raw: unknown): Skill | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const tags = stringArray(s.tags);
  if (
    typeof s.id !== "string" ||
    typeof s.name !== "string" ||
    typeof s.description !== "string" ||
    !tags ||
    typeof s.fileName !== "string" ||
    typeof s.size !== "number" ||
    typeof s.content !== "string" ||
    typeof s.createdAt !== "number"
  ) {
    return null;
  }
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    tags,
    fileName: s.fileName,
    size: s.size,
    content: s.content,
    createdAt: s.createdAt,
  };
}

const storage = localList<Skill>({
  key: SKILLS_STORAGE_KEY,
  field: "skills",
  version: 1,
  tag: "[skills]",
  readItem: readSkill,
});

/**
 * The saved skills; [] when there are none or they cannot be read. Never throws.
 * Names saved before #237 come back as handles, and are saved so with the next change.
 */
export const loadSkills = (from?: Storage): Skill[] =>
  withHandles(storage.load(from), (x) => nameFromFileName(x.fileName) || "skill");
/** False when storage refused the write. Never throws. */
export const saveSkills = storage.save;

interface SkillsState {
  skills: Skill[];
  /** Adds a skill; false (and nothing changes) if it could not be saved. */
  add: (skill: Skill) => boolean;
  /** Swaps the skill with `skill.id` for `skill`; false if it could not be saved. */
  replace: (skill: Skill) => boolean;
  /** Removes it (#211); false (and nothing changes) if that could not be saved. */
  remove: (id: string) => boolean;
  /** Puts a removed skill back where it was in the list -- Undo (#211). */
  restore: (skill: Skill, index: number) => boolean;
}

export const useSkills = create<SkillsState>((set, get) => {
  const commit = (next: Skill[]) => {
    if (!saveSkills(next)) return false;
    set({ skills: next });
    return true;
  };
  return {
    skills: typeof window === "undefined" ? [] : loadSkills(),
    add: (skill) => commit([...get().skills, skill]),
    replace: (skill) => commit(get().skills.map((s) => (s.id === skill.id ? skill : s))),
    remove: (id) => commit(get().skills.filter((x) => x.id !== id)),
    restore: (skill, index) => {
      const next = get().skills.filter((x) => x.id !== skill.id);
      next.splice(Math.max(0, Math.min(index, next.length)), 0, skill);
      return commit(next);
    },
  };
});

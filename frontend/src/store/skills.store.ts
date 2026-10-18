import { create } from "zustand";
import type { Skill } from "@/app/canvas/skills/skillFile";

/**
 * The user's skills (#206), kept in localStorage under their own key.
 *
 * Written by hand rather than through zustand's persist, for the same reason
 * as sidebar.store: neither direction may throw. And a write has to be able
 * to fail visibly -- the Upload dialog stays open with "Couldn't save the
 * skill." rather than showing a skill that a reload would take away -- so
 * the store only changes once the write has gone through.
 */

export const SKILLS_STORAGE_KEY = "gcos-skills";
const VERSION = 1;

let warned = false;
function warnOnce(message: string, err?: unknown): void {
  if (warned) return;
  warned = true;
  console.warn(`[skills] ${message}`, err ?? "");
}

function readSkill(raw: unknown): Skill | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (
    typeof s.id !== "string" ||
    typeof s.name !== "string" ||
    typeof s.description !== "string" ||
    !Array.isArray(s.tags) ||
    !s.tags.every((t) => typeof t === "string") ||
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
    tags: s.tags as string[],
    fileName: s.fileName,
    size: s.size,
    content: s.content,
    createdAt: s.createdAt,
  };
}

/** The saved skills; [] when there are none or they cannot be read. Never throws. */
export function loadSkills(storage: Storage | undefined = globalThis.localStorage): Skill[] {
  let text: string | null;
  try {
    text = storage?.getItem(SKILLS_STORAGE_KEY) ?? null;
  } catch (err) {
    console.warn("[skills] Could not read the saved skills.", err);
    return [];
  }
  if (text === null) return [];
  try {
    const data = JSON.parse(text) as { version?: unknown; skills?: unknown };
    if (data?.version !== VERSION || !Array.isArray(data.skills)) throw new Error("unknown format");
    const skills = data.skills.map(readSkill);
    if (skills.some((s) => s === null)) console.warn("[skills] Skipped saved skills that could not be read.");
    return skills.filter((s): s is Skill => s !== null);
  } catch (err) {
    // Left in place: the next save replaces it.
    console.warn("[skills] The saved skills are unreadable and were ignored.", err);
    return [];
  }
}

/** False when storage refused the write. Never throws. */
export function saveSkills(skills: Skill[], storage: Storage | undefined = globalThis.localStorage): boolean {
  try {
    if (!storage) throw new Error("no localStorage");
    storage.setItem(SKILLS_STORAGE_KEY, JSON.stringify({ version: VERSION, skills }));
    return true;
  } catch (err) {
    warnOnce("The skills could not be saved to localStorage.", err);
    return false;
  }
}

interface SkillsState {
  skills: Skill[];
  /** Adds a skill; false (and nothing changes) if it could not be saved. */
  add: (skill: Skill) => boolean;
  /** Swaps the skill with `skill.id` for `skill`; false if it could not be saved. */
  replace: (skill: Skill) => boolean;
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
  };
});

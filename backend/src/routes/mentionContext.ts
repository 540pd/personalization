// The agent and skills a prompt's @ handles name (#239), sent alongside it.
// Skills live in the user's browser, so their text travels with the request;
// it ends up in a model's system instruction, so it is bounded and stripped
// of control characters. Validated inline: no Zod (CLAUDE.md).

import type { AgentContext, SkillContext } from "../capabilities/types.js";

export const MAX_CONTEXT_SKILLS = 20;
/** Agent instructions and skill bodies together. */
export const MAX_CONTEXT_CHARS = 400 * 1024;
const MAX_NAME = 60;

// Newlines and tabs are meaningful in instructions; every other control isn't.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const clean = (text: string) => text.replace(CONTROL, " ");
const cleanName = (name: string) => clean(name).replace(/\s+/g, " ").trim().slice(0, MAX_NAME);

export type ReadContext =
  | { ok: true; agent?: AgentContext; skills?: SkillContext[] }
  | { ok: false; message: string };

/** `agent` and `skills` from a request body; either may be absent. */
export function readMentionContext(agent: unknown, skills: unknown): ReadContext {
  let outAgent: AgentContext | undefined;
  if (agent !== undefined && agent !== null) {
    const a = agent as Record<string, unknown>;
    if (typeof agent !== "object" || typeof a.name !== "string" || typeof a.instructions !== "string") {
      return { ok: false, message: "agent must be { name, instructions }, both strings." };
    }
    outAgent = { name: cleanName(a.name), instructions: clean(a.instructions) };
  }

  let outSkills: SkillContext[] | undefined;
  if (skills !== undefined && skills !== null) {
    if (!Array.isArray(skills)) return { ok: false, message: "skills must be an array." };
    if (skills.length > MAX_CONTEXT_SKILLS) {
      return { ok: false, message: `skills can list at most ${MAX_CONTEXT_SKILLS}.` };
    }
    outSkills = [];
    for (const raw of skills as unknown[]) {
      const s = raw as Record<string, unknown>;
      if (typeof raw !== "object" || raw === null || typeof s.name !== "string" || typeof s.content !== "string") {
        return { ok: false, message: "each skill must be { name, content }, both strings." };
      }
      outSkills.push({ name: cleanName(s.name), content: clean(s.content) });
    }
  }

  const size = (outAgent?.instructions.length ?? 0) + (outSkills ?? []).reduce((n, s) => n + s.content.length, 0);
  if (size > MAX_CONTEXT_CHARS) return { ok: false, message: "agent and skills are over 400 KB in all." };

  return {
    ok: true,
    ...(outAgent ? { agent: outAgent } : {}),
    ...(outSkills?.length ? { skills: outSkills } : {}),
  };
}

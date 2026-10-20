// @ mentions in a panel's Instruction (#239): `@brand-voice` names a skill,
// `@copywriter` an agent. The prompt stays plain text; handles are looked up
// when Create is pressed, so an edited skill applies the next time. Pure
// functions, tested without a DOM.

import type { Agent } from "@/store/agents.store";
import { sortByName, type Listed } from "../library/fields";
import { stripFrontMatter, type Skill } from "../skills/skillFile";

/** Which mentions a panel kind takes: Prompt panels both, others skills (#240). */
export type MentionScope = "skills" | "skills-and-agents";

/** What the menu and the resolver need of a skill or an agent. */
export type MentionSkill = Pick<Skill, "id" | "name" | "description" | "tags" | "content">;
export type MentionAgent = Pick<Agent, "id" | "name" | "description" | "tags" | "instructions" | "model" | "skillIds">;

export interface Mentionables {
  skills: readonly MentionSkill[];
  agents: readonly MentionAgent[];
}

/** One `@handle` in the text: [start, end) covers the @ and the handle. */
export interface Mention {
  start: number;
  end: number;
  handle: string;
}

// At the start or after whitespace, so an email address is no mention. A
// handle's own shape (#237); an upper-case letter still counts, compared as
// lower case, and trailing punctuation ("@brand-voice.") ends it.
const MENTION = /(^|\s)@([a-z0-9]+(?:-[a-z0-9]+)*)(?![a-z0-9])/gi;

export function findMentions(text: string): Mention[] {
  const out: Mention[] = [];
  for (const m of text.matchAll(MENTION)) {
    const start = (m.index ?? 0) + m[1].length;
    out.push({ start, end: start + 1 + m[2].length, handle: m[2].toLowerCase() });
  }
  return out;
}

/**
 * The `@…` being typed at the caret, for the menu: where its @ is and what
 * follows it up to the caret. Null when the caret isn't in one -- including
 * an @ inside a word, as in an email address.
 */
export function activeMention(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  if (/[\s@]/.test(query)) return null;
  return { start: at, query };
}

export interface MenuItems<S, A> {
  skills: S[];
  agents: A[];
}

/** Both lists narrowed on handle or description, ignoring case, each A–Z. */
export function menuItems<S extends Listed, A extends Listed>(
  query: string,
  skills: readonly S[],
  agents: readonly A[],
  scope: MentionScope,
): MenuItems<S, A> {
  const q = query.toLowerCase();
  const match = (x: Listed) => !q || x.name.includes(q) || x.description.toLowerCase().includes(q);
  return {
    skills: sortByName(skills.filter(match)),
    agents: scope === "skills-and-agents" ? sortByName(agents.filter(match)) : [],
  };
}

/**
 * The text with the `@query` at `start` (and the rest of that word) replaced
 * by `@handle `, and where the caret goes: after the space. Also the edit
 * itself -- [from, to) becomes `insert` -- for an insert the browser can undo.
 */
export function insertMention(
  text: string,
  start: number,
  handle: string,
): { text: string; caret: number; from: number; to: number; insert: string } {
  let end = start + 1;
  while (end < text.length && !/\s/.test(text[end])) end++;
  // A space already there is kept, not doubled, and the caret goes past it.
  const to = text[end] === " " ? end + 1 : end;
  const insert = `@${handle} `;
  return { text: text.slice(0, start) + insert + text.slice(to), caret: start + insert.length, from: start, to, insert };
}

export interface Resolved<S, A> {
  /** The prompt's agent: the first agent handle. Prompt panels only. */
  agent?: A;
  /** Named skills, then the agent's own, each once. */
  skills: S[];
  /** Mentions that name a skill or agent, for tinting. */
  known: Mention[];
  /** Handles that name neither, once each, in order. */
  unknown: string[];
  /** Agent handles after the first, once each: sent as text. */
  extraAgents: string[];
  /** Agent handles in a panel that takes skills only (#240). */
  agentsNotHere: string[];
}

/**
 * What the prompt's handles name. An agent wins over a skill of the same
 * handle: names are unique within each library, not across both.
 */
export function resolveMentions<S extends MentionSkill, A extends MentionAgent>(
  text: string,
  { skills, agents }: { skills: readonly S[]; agents: readonly A[] },
  scope: MentionScope,
): Resolved<S, A> {
  const out: Resolved<S, A> = { skills: [], known: [], unknown: [], extraAgents: [], agentsNotHere: [] };
  const addSkill = (s: S) => {
    if (!out.skills.includes(s)) out.skills.push(s);
  };
  const once = (list: string[], handle: string) => {
    if (!list.includes(handle)) list.push(handle);
  };
  const named: S[] = [];
  for (const m of findMentions(text)) {
    const agent = agents.find((a) => a.name === m.handle);
    const skill = skills.find((s) => s.name === m.handle);
    if (agent && scope === "skills-and-agents") {
      if (!out.agent) out.agent = agent;
      if (out.agent === agent) out.known.push(m);
      else once(out.extraAgents, m.handle);
    } else if (skill) {
      out.known.push(m);
      if (!named.includes(skill)) named.push(skill);
    } else if (agent) {
      once(out.agentsNotHere, m.handle);
    } else {
      once(out.unknown, m.handle);
    }
  }
  named.forEach(addSkill);
  for (const id of out.agent?.skillIds ?? []) {
    const s = skills.find((x) => x.id === id);
    if (s) addSkill(s);
  }
  return out;
}

/** The notes under the Instruction: what's sent as text, and why. */
export function mentionNotes(r: Pick<Resolved<unknown, unknown>, "unknown" | "extraAgents" | "agentsNotHere">): string[] {
  return [
    ...r.unknown.map((h) => `@${h} isn't in your skills or agents, so it's sent as text.`),
    ...r.extraAgents.map((h) => `One agent per prompt: @${h} is sent as text.`),
    ...r.agentsNotHere.map((h) => `Agents work in Prompt panels: @${h} is sent as text.`),
  ];
}

/** What a request carries for the model besides the prompt itself. */
export interface MentionContext {
  agent?: { name: string; instructions: string };
  skills?: { name: string; content: string }[];
}

/** The request's agent and skills; undefined when the prompt names neither. */
export function mentionContext(r: Pick<Resolved<MentionSkill, MentionAgent>, "agent" | "skills">): MentionContext | undefined {
  const skills = r.skills
    .map((s) => ({ name: s.name, content: stripFrontMatter(s.content).trim() }))
    .filter((s) => s.content);
  if (!r.agent && !skills.length) return undefined;
  return {
    ...(r.agent ? { agent: { name: r.agent.name, instructions: r.agent.instructions } } : {}),
    ...(skills.length ? { skills } : {}),
  };
}

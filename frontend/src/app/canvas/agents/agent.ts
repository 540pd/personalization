// Agents (#208): an agent is a markdown file. Its body is the instructions;
// its front matter may set the name, description, model, skills and tags.
// Pure functions, tested without a DOM.

import { instructionKind } from "../components/NodePanel/kinds/instructionKind";
import type { Agent } from "@/store/agents.store";
import { findByName, type Listed } from "../library/fields";
import { frontList, frontString, metaFromFile, readFrontMatter, stripFrontMatter } from "../skills/skillFile";

/**
 * The models an agent can be set to: the Prompt panel's own list, so an
 * agent never names a model its panel cannot run.
 */
export const AGENT_MODELS = instructionKind.models;
export const DEFAULT_AGENT_MODEL: string = instructionKind.defaultModel ?? AGENT_MODELS[0].id;

/** A model's label; an id from a model since retired shows as the default's. */
export function modelLabel(id: string): string {
  const model = AGENT_MODELS.find((m) => m.id === id) ?? AGENT_MODELS.find((m) => m.id === DEFAULT_AGENT_MODEL);
  return model?.label ?? id;
}

/** A model named by id or label, ignoring case; undefined if none matches. */
export function matchModel(value: string): string | undefined {
  const v = value.trim().toLowerCase();
  return AGENT_MODELS.find((m) => m.id.toLowerCase() === v || m.label.toLowerCase() === v)?.id;
}

/** What an agent file sets, plus what could not be used from it. */
export interface AgentFile {
  name: string;
  description: string;
  tags: string[];
  /** The body: everything after the front matter, trimmed. */
  instructions: string;
  model: string;
  skillIds: string[];
  /** The file's `model`, when it matched none (the default is used). */
  unknownModel?: string;
  /** Skill names the file lists that are not in the library (skipped). */
  missingSkills: string[];
}

/**
 * Reads an agent file against the current skills library. Never throws:
 * an unknown model falls back to the default and unmatched skills are
 * skipped, both reported for the form to show.
 */
export function readAgentFile(text: string, fileName: string, skills: readonly Listed[]): AgentFile {
  const front = readFrontMatter(text);
  const meta = metaFromFile(text, fileName);

  const modelValue = frontString(front, "model");
  const matched = modelValue ? matchModel(modelValue) : undefined;

  const skillIds: string[] = [];
  const missingSkills: string[] = [];
  for (const wanted of frontList(front, "skills")) {
    // As handles (#237): `skills: [Brand voice]` still finds brand-voice.
    const skill = findByName(skills, wanted);
    if (!skill) missingSkills.push(wanted);
    else if (!skillIds.includes(skill.id)) skillIds.push(skill.id);
  }

  return {
    ...meta,
    instructions: stripFrontMatter(text).trim(),
    model: matched ?? DEFAULT_AGENT_MODEL,
    unknownModel: modelValue && !matched ? modelValue : undefined,
    skillIds,
    missingSkills,
  };
}

/** "Brand voice", "Brand voice and Tone", "A, B and C". */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The notes shown under the file: problems that did not stop the upload. */
export function agentFileNotes(file: Pick<AgentFile, "unknownModel" | "missingSkills">): string[] {
  const notes: string[] = [];
  if (file.unknownModel) {
    notes.push(`Model ${file.unknownModel} isn't available, so ${modelLabel(DEFAULT_AGENT_MODEL)} is used.`);
  }
  const n = file.missingSkills.length;
  if (n) {
    notes.push(`${listNames(file.missingSkills)} ${n === 1 ? "isn't" : "aren't"} in your skills, so ${n === 1 ? "it's" : "they're"} skipped.`);
  }
  return notes;
}

/** "Gemini 3.8 Flash · 2 skills". */
export function agentSummary(model: string, skillCount: number): string {
  const skills = skillCount === 0 ? "no skills" : skillCount === 1 ? "1 skill" : `${skillCount} skills`;
  return `${modelLabel(model)} · ${skills}`;
}

/** The agent's skills that still exist, in the order it lists them. */
export function agentSkills<S extends Listed>(agent: Pick<Agent, "skillIds">, skills: readonly S[]): S[] {
  return agent.skillIds.flatMap((id) => skills.find((s) => s.id === id) ?? []);
}

/** The template behind "Example agent file": every field an agent file can set. */
export const EXAMPLE_AGENT_FILE = `---
name: copywriter
description: Writes on-brand taglines and headlines
model: ${AGENT_MODELS.find((m) => m.id !== DEFAULT_AGENT_MODEL)?.id ?? DEFAULT_AGENT_MODEL}
skills: [brand-voice]
tags: [copy]
---
You are a senior copywriter. For each request, write three options, each
under eight words. Lead with the benefit. Use sentence case. Return only the
options, one per line.
`;

/** Downloads EXAMPLE_AGENT_FILE as agent-example.md; false if the browser refused. */
export function downloadExampleAgentFile(): boolean {
  try {
    const url = URL.createObjectURL(new Blob([EXAMPLE_AGENT_FILE], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "agent-example.md";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  } catch (err) {
    console.warn("[agents] Could not download the example agent file.", err);
    return false;
  }
}

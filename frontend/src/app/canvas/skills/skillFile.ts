// Skills (#206): reading an uploaded markdown file and checking the Upload
// skill form. Pure functions, so the rules are tested without a DOM.

export const MAX_SKILL_BYTES = 100 * 1024;
export const MAX_NAME = 60;
export const MAX_DESCRIPTION = 200;
export const MAX_TAG = 24;
export const MAX_TAGS = 5;

const EXTENSIONS = [".md", ".markdown"];

export interface Skill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  fileName: string;
  /** Bytes, as the file reported it. */
  size: number;
  /** The file's text. Only ever shown as text, never rendered as HTML. */
  content: string;
  createdAt: number;
}

/** Why a picked file cannot be a skill, before reading it; null if it may be. */
export function fileProblem(file: { name: string; size: number }): string | null {
  const lower = file.name.toLowerCase();
  if (!EXTENSIONS.some((ext) => lower.endsWith(ext))) return `${file.name} isn't a markdown file`;
  if (file.size > MAX_SKILL_BYTES) return `${file.name} is over 100 KB`;
  if (file.size === 0) return `${file.name} is empty`;
  return null;
}

/** "brand-voice.md" → "Brand voice". */
export function nameFromFileName(fileName: string): string {
  const stem = fileName.replace(/\.(md|markdown)$/i, "").replace(/[-_\s]+/g, " ").trim();
  return stem ? stem[0].toUpperCase() + stem.slice(1) : "";
}

function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) return v.slice(1, -1).trim();
  return v;
}

/**
 * What the form can pre-fill from a file: front matter `name` / `description`
 * first, then the first `# heading`, then the file name. Only flat
 * `key: value` front matter is read -- that is all a SKILL.md header holds.
 */
export function metaFromFile(text: string, fileName: string): { name: string; description: string } {
  let name = "";
  let description = "";
  let body = text;

  const front = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (front) {
    body = text.slice(front[0].length);
    for (const line of front[1].split(/\r?\n/)) {
      const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
      if (!m) continue;
      const key = m[1].toLowerCase();
      if (key === "name" && !name) name = unquote(m[2]);
      if (key === "description" && !description) description = unquote(m[2]);
    }
  }

  if (!name) {
    const heading = /^#[ \t]+(.+?)[ \t#]*$/m.exec(body);
    if (heading) name = heading[1].trim();
  }
  if (!name) name = nameFromFileName(fileName);

  return { name: name.slice(0, MAX_NAME), description: description.slice(0, MAX_DESCRIPTION) };
}

/** Lower case, runs of spaces to "-", at most MAX_TAG characters; "" if nothing is left. */
export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/,/g, "").slice(0, MAX_TAG);
}

export function nameError(name: string): string | null {
  const n = name.trim();
  if (!n) return "Enter a name";
  if (n.length > MAX_NAME) return `Keep it to ${MAX_NAME} characters`;
  return null;
}

export function descriptionError(description: string): string | null {
  const d = description.trim();
  if (!d) return "Enter a description";
  if (d.length > MAX_DESCRIPTION) return `Keep it to ${MAX_DESCRIPTION} characters`;
  return null;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The skill already using this name, ignoring case. */
export function findByName(skills: readonly Skill[], name: string): Skill | undefined {
  return skills.find((s) => sameName(s.name, name));
}

/** "Brand voice" → "Brand voice (2)", or the first number not yet taken. */
export function uniqueName(skills: readonly Skill[], name: string): string {
  const base = name.trim();
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})`;
    if (!findByName(skills, candidate)) return candidate;
  }
}

export function sortByName(skills: readonly Skill[]): Skill[] {
  return [...skills].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** Every tag in use, alphabetical, once each. */
export function allTags(skills: readonly Skill[]): string[] {
  return [...new Set(skills.flatMap((s) => s.tags))].sort();
}

/** Search on name or description, ignoring case; optionally only skills with `tag`. */
export function filterSkills(skills: readonly Skill[], query: string, tag: string | null): Skill[] {
  const q = query.trim().toLowerCase();
  return skills.filter(
    (s) =>
      (!tag || s.tags.includes(tag)) &&
      (!q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)),
  );
}

/** "512 B", "2.1 KB". */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

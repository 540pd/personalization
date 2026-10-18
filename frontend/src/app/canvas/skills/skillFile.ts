// Markdown files (#206): checking one picked for Upload skill -- or for an
// agent's Import .md (#208) -- and reading what it can pre-fill. Pure
// functions, so the rules are tested without a DOM.

import { MAX_DESCRIPTION, MAX_NAME, MAX_TAGS, normalizeTag, type Listed } from "../library/fields";

export const MAX_SKILL_BYTES = 100 * 1024;

const EXTENSIONS = [".md", ".markdown"];

export interface Skill extends Listed {
  fileName: string;
  /** Bytes, as the file reported it. */
  size: number;
  /** The file's text. Only ever shown as text, never rendered as HTML. */
  content: string;
  createdAt: number;
}

/** Why a picked file cannot be used, before reading it; null if it may be. */
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

const FRONT_MATTER = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** The file without its front matter, if it opens with one. */
export function stripFrontMatter(text: string): string {
  const front = FRONT_MATTER.exec(text);
  return front ? text.slice(front[0].length) : text;
}

/** Front matter values: a string, or a list for `[a, b]` and `- a` items. */
export type FrontMatter = Record<string, string | string[]>;

function listItems(value: string): string[] {
  return value
    .split(",")
    .map(unquote)
    .filter(Boolean);
}

/**
 * The front matter's keys (lower case) and values. Only what an agent or
 * skill header holds: `key: value`, `key: [a, b]`, and `key:` followed by
 * `- a` lines. Anything else is skipped, never an error.
 */
export function readFrontMatter(text: string): FrontMatter {
  const out: FrontMatter = {};
  const front = FRONT_MATTER.exec(text);
  if (!front) return out;
  let listKey: string | null = null;
  for (const line of front[1].split(/\r?\n/)) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && listKey) {
      const v = unquote(item[1]);
      if (v) (out[listKey] as string[]).push(v);
      continue;
    }
    listKey = null;
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key in out) continue;
    const value = m[2].trim();
    if (!value) {
      out[key] = [];
      listKey = key;
    } else if (value.startsWith("[") && value.endsWith("]")) {
      out[key] = listItems(value.slice(1, -1));
    } else {
      out[key] = unquote(value);
    }
  }
  return out;
}

/** A front matter value as one string ("" if absent or a list). */
export function frontString(front: FrontMatter, key: string): string {
  const v = front[key];
  return typeof v === "string" ? v : "";
}

/** A front matter value as a list; a lone string counts as one item. */
export function frontList(front: FrontMatter, key: string): string[] {
  const v = front[key];
  return Array.isArray(v) ? v : v ? listItems(v) : [];
}

/**
 * What a form can pre-fill from a file: front matter `name` / `description`
 * first, then the first `# heading`, then the file name; `tags` from front
 * matter only.
 */
export function metaFromFile(text: string, fileName: string): { name: string; description: string; tags: string[] } {
  const front = readFrontMatter(text);
  let name = frontString(front, "name");
  if (!name) {
    const heading = /^#[ \t]+(.+?)[ \t#]*$/m.exec(stripFrontMatter(text));
    if (heading) name = heading[1].trim();
  }
  if (!name) name = nameFromFileName(fileName);

  const tags: string[] = [];
  for (const raw of frontList(front, "tags")) {
    const tag = normalizeTag(raw);
    if (tag && !tags.includes(tag) && tags.length < MAX_TAGS) tags.push(tag);
  }

  return {
    name: name.slice(0, MAX_NAME),
    description: frontString(front, "description").slice(0, MAX_DESCRIPTION),
    tags,
  };
}

/** "512 B", "2.1 KB". */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

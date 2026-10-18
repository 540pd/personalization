// The rules every rail library shares -- Skills (#206) and Agents (#208): a
// name, a description and tags on each item, and a table that sorts,
// searches and filters them. Pure functions, tested without a DOM.

export const MAX_NAME = 60;
export const MAX_DESCRIPTION = 200;
export const MAX_TAG = 24;
export const MAX_TAGS = 5;

/** What a library item has for the table and the form to work with. */
export interface Listed {
  id: string;
  name: string;
  description: string;
  tags: string[];
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

/** The item already using this name, ignoring case. */
export function findByName<T extends Listed>(items: readonly T[], name: string): T | undefined {
  return items.find((s) => sameName(s.name, name));
}

/** "Brand voice" → "Brand voice (2)", or the first number not yet taken. */
export function uniqueName(items: readonly Listed[], name: string): string {
  const base = name.trim();
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})`;
    if (!findByName(items, candidate)) return candidate;
  }
}

export function sortByName<T extends Listed>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** Every tag in use, alphabetical, once each. */
export function allTags(items: readonly Listed[]): string[] {
  return [...new Set(items.flatMap((s) => s.tags))].sort();
}

/** Search on name or description, ignoring case; optionally only items with `tag`. */
export function filterItems<T extends Listed>(items: readonly T[], query: string, tag: string | null): T[] {
  const q = query.trim().toLowerCase();
  return items.filter(
    (s) =>
      (!tag || s.tags.includes(tag)) &&
      (!q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)),
  );
}

/** Same strings in the same order -- tags and skill lists, for "has this changed?". */
export function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** A new item id, prefixed by its kind ("skill-…", "agent-…"). */
export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

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

/**
 * A name as a handle (#237), so a prompt can reference it without quotes:
 * lower case a-z and 0-9, words joined by single hyphens. "Brand Voice!" →
 * "brand-voice", "café" → "cafe". While `typing`, one hyphen may end it, so
 * a space typed after "brand" isn't lost before "voice" follows.
 */
export function toHandle(raw: string, typing = false): string {
  const h = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-/, "");
  return typing ? h : h.replace(/-$/, "");
}

/** Under every Name field (#237). */
export const HANDLE_HINT = "Lowercase letters, numbers and hyphens, so it's easy to reference in a prompt";

/** A handle cut to `room` characters, never ending in a hyphen. */
function fit(handle: string, room = MAX_NAME): string {
  return handle.slice(0, room).replace(/-$/, "");
}

/** The first of `candidates` that leaves a handle, cut to fit; "" if none does. */
export function firstHandle(...candidates: string[]): string {
  for (const c of candidates) {
    const h = fit(toHandle(c));
    if (h) return h;
  }
  return "";
}

export function nameError(name: string): string | null {
  const n = toHandle(name);
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

const sameName = (a: string, b: string) => toHandle(a) === toHandle(b);

/** The item already using this name, compared as handles: "Brand voice" finds brand-voice. */
export function findByName<T extends Listed>(items: readonly T[], name: string): T | undefined {
  return items.find((s) => sameName(s.name, name));
}

/** "brand-voice" → "brand-voice-2", or the first number not yet taken, within MAX_NAME. */
export function uniqueName(items: readonly Listed[], name: string): string {
  const base = toHandle(name);
  for (let i = 2; ; i++) {
    const suffix = `-${i}`;
    const candidate = fit(base, MAX_NAME - suffix.length) + suffix;
    if (!findByName(items, candidate)) return candidate;
  }
}

/**
 * Names saved before #237 as handles, in list order: "Brand voice" →
 * brand-voice. A later item whose handle is taken gets -2, -3…; one left
 * with nothing gets `fallback(item)`. Items already right are kept as is.
 */
export function withHandles<T extends Listed>(items: readonly T[], fallback: (item: T) => string): T[] {
  const out: T[] = [];
  for (const item of items) {
    const handle = firstHandle(item.name, fallback(item));
    const name = findByName(out, handle) ? uniqueName(out, handle) : handle;
    out.push(name === item.name ? item : { ...item, name });
  }
  return out;
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

/**
 * A duplicate's name (#211, #237): "copywriter-copy", then "-copy-2",
 * "-copy-3"… The base is cut so the result stays within MAX_NAME.
 */
export function copyName(items: readonly Listed[], name: string): string {
  const base = toHandle(name);
  for (let i = 1; ; i++) {
    const suffix = i === 1 ? "-copy" : `-copy-${i}`;
    const candidate = fit(base, MAX_NAME - suffix.length) + suffix;
    if (!findByName(items, candidate)) return candidate;
  }
}

/** Same strings in the same order -- tags and skill lists, for "has this changed?". */
export function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** A new item id, prefixed by its kind ("skill-…", "agent-…"). */
export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

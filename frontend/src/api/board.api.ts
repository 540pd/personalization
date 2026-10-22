// The board saved to the user's account (#324), through /api/proxy.

import { apiFetch } from "./canvas.api";

export interface CurrentBoard {
  /** 0 until the first save. */
  revision: number;
  updatedAt: string | null;
  /** The board file, unchecked: the caller parses it like an opened file. */
  content: unknown;
}

export type SaveReply =
  | { ok: true; revision: number }
  /** Saved elsewhere since: `revision` is the latest. */
  | { ok: false; kind: "conflict"; revision: number }
  | { ok: false; kind: "tooLarge"; message: string }
  /** Offline, the server failing, or the session gone: worth trying again. */
  | { ok: false; kind: "retry" };

/** The board as saved; throws when it cannot be had (offline, a 5xx). */
export async function fetchCurrentBoard(): Promise<CurrentBoard> {
  const res = await apiFetch("boards/current");
  if (!res.ok) throw new Error(`Loading the board failed (${res.status})`);
  return (await res.json()) as CurrentBoard;
}

/** Browsers refuse a keepalive request with a larger body. */
const KEEPALIVE_LIMIT = 64 * 1024;

/**
 * Saves the board. With `keepalive`, the request outlives the page -- the
 * save as a tab closes -- when it is small enough; larger, it is not sent,
 * and the change goes on the next load instead (it is marked pending).
 */
export async function saveCurrentBoard(revision: number, content: unknown, { keepalive = false } = {}): Promise<SaveReply> {
  const body = JSON.stringify({ revision, content });
  if (keepalive && new Blob([body]).size > KEEPALIVE_LIMIT) return { ok: false, kind: "retry" };
  let res: Response;
  try {
    res = await apiFetch("boards/current", { method: "PUT", body, keepalive });
  } catch {
    return { ok: false, kind: "retry" };
  }
  const reply = (await res.json().catch(() => ({}))) as { revision?: number; message?: string };
  if (res.ok && typeof reply.revision === "number") return { ok: true, revision: reply.revision };
  if (res.status === 409 && typeof reply.revision === "number") return { ok: false, kind: "conflict", revision: reply.revision };
  if (res.status === 413) return { ok: false, kind: "tooLarge", message: reply.message ?? "The board is too large to save." };
  return { ok: false, kind: "retry" };
}

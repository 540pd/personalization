// The board saved to the user's account (#324): one board per user for now,
// its content the board file format (#198), saved by revision.

import { createHash } from "node:crypto";
import { boardContentStore, boardStore, type Board, type WriteResult } from "../lib/boards/index.js";

export const DEFAULT_BOARD_NAME = "PlaySpace";

/** Firestore's document limit is 1 MiB; this leaves room for the fields. */
export const MAX_BOARD_BYTES = 900 * 1024;

// The board file's envelope (frontend boardFileFormat.ts). The frontend
// checks every node when it reads a board back, as it does an opened file;
// here only the shape that makes it a board file, and its size.
const FORMAT = "gcos-playspace";
const VERSION = 1;
const LISTS = ["panels", "nodes", "frames", "connections"] as const;

/** Why `content` is not a board file, or null when it is. */
export function boardFileProblem(content: unknown): string | null {
  if (typeof content !== "object" || content === null || Array.isArray(content)) return "content must be a board file.";
  const c = content as Record<string, unknown>;
  if (c.format !== FORMAT) return `content.format must be "${FORMAT}".`;
  if (c.version !== VERSION) return `content.version ${String(c.version)} is not supported.`;
  for (const key of LISTS) {
    if (!Array.isArray(c[key]) || !(c[key] as unknown[]).every((v) => typeof v === "object" && v !== null)) {
      return `content.${key} must be a list of objects.`;
    }
  }
  if (c.topLayer !== "canvas" && c.topLayer !== "dom") return 'content.topLayer must be "canvas" or "dom".';
  return null;
}

/** The user's current board's id: derived, so it is the same on every
 * instance and two first loads at once make one board. */
export function currentBoardId(userId: string): string {
  return `board-${createHash("sha256").update(userId).digest("hex").slice(0, 32)}`;
}

export interface CurrentBoard {
  board: Pick<Board, "id" | "name">;
  /** 0 until the first save. */
  revision: number;
  updatedAt: string | null;
  content: unknown;
}

export async function getCurrentBoard(userId: string): Promise<CurrentBoard> {
  const board = await boardStore().ensure(currentBoardId(userId), userId, DEFAULT_BOARD_NAME);
  const saved = await boardContentStore().read(board.id);
  return {
    board: { id: board.id, name: board.name },
    revision: saved?.revision ?? 0,
    updatedAt: saved?.updatedAt ?? null,
    content: saved ? JSON.parse(saved.json) : null,
  };
}

export type SaveResult = WriteResult | { ok: false; tooLarge: true; bytes: number };

export async function saveCurrentBoard(userId: string, content: object, baseRevision: number): Promise<SaveResult> {
  const json = JSON.stringify(content);
  const bytes = Buffer.byteLength(json);
  if (bytes > MAX_BOARD_BYTES) return { ok: false, tooLarge: true, bytes };
  const board = await boardStore().ensure(currentBoardId(userId), userId, DEFAULT_BOARD_NAME);
  return boardContentStore().write(board.id, json, baseRevision);
}

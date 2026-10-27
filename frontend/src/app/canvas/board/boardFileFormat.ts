// Save to file (#198): the whole board as one JSON document.
//
// Open file (#199) reads this back, so the shape below is a contract: bump
// BOARD_FILE_VERSION on any change a version-1 reader would misread.
//
// Konva nodes are stored the way the clipboard stores them -- className,
// attrs, and the two konvaNodes fields a node cannot rebuild itself
// (imageUrl, label) -- so a file loads with the same constructors a paste
// uses. Everything else in konvaNodes is recomputed by syncNodeGeometry.

import type { PanelInstance } from "@/store/nodePanel.store";
import type { Connection } from "@/store/connection.store";
import type { FrameRecord } from "@/store/frame.store";
import type { TopLayer } from "@/store/layerOrder.store";
import type { NodeEntry } from "./nodeEntry";

export const BOARD_FILE_FORMAT = "gcos-playspace";
export const BOARD_FILE_VERSION = 1;

/** A JSON value, the only thing an attr may be once it is in the file. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** A Konva node as stored: what the clipboard copies, minus anything not JSON. */
export type BoardFileNode = NodeEntry<Record<string, Json>>;

/**
 * A panel without the parts that describe this session rather than the
 * board: whether it is selected or open, and an in-flight generation job,
 * which would reconnect to nothing.
 */
export type BoardFilePanel = Omit<PanelInstance, "job">;

export function toFilePanel({ job: _j, ...rest }: PanelInstance): BoardFilePanel {
  return rest;
}

export interface BoardFile {
  format: typeof BOARD_FILE_FORMAT;
  version: typeof BOARD_FILE_VERSION;
  savedAt: string;
  /** Paint order: first is bottom. */
  panels: BoardFilePanel[];
  /** Paint order: first is bottom. */
  nodes: BoardFileNode[];
  frames: FrameRecord[];
  connections: Connection[];
  /** Whether the canvas or the panels paint on top -- an image dragged over a node. */
  topLayer: TopLayer;
}

/**
 * Keeps an attr only if it survives JSON unchanged. Drops functions (an
 * uploaded image's hitFunc), elements (its HTMLImageElement) and anything
 * else with a prototype of its own; those are rebuilt on load. Undefined is
 * dropped too, as JSON.stringify would.
 */
function toJson(value: unknown): Json | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    const items = value.map(toJson);
    return items.every((v) => v !== undefined) ? (items as Json[]) : undefined;
  }
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return plainAttrs(value as Record<string, unknown>);
  }
  return undefined;
}

export function plainAttrs(attrs: Record<string, unknown>): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const [key, value] of Object.entries(attrs)) {
    const json = toJson(value);
    if (json !== undefined) out[key] = json;
  }
  return out;
}

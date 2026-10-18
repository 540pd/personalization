// Save to file (#198): the whole board as one JSON document.
//
// Open file (#199) reads this back, so the shape below is a contract: bump
// BOARD_FILE_VERSION on any change a version-1 reader would misread.
//
// Konva nodes are stored the way the clipboard stores them -- className,
// attrs, and the two konvaNodes fields a node cannot rebuild itself
// (imageUrl, label) -- so a file loads with the same constructors a paste
// uses. Everything else in konvaNodes is recomputed by syncNodeGeometry.

import type Konva from "konva";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { useConnectionStore, type Connection } from "@/store/connection.store";
import { useFrames, type FrameRecord } from "@/store/frame.store";
import { useLayerOrder, type TopLayer } from "@/store/layerOrder.store";
import { boardStage } from "@/lib/canvas/boardStage";

export const BOARD_FILE_FORMAT = "gcos-playspace";
export const BOARD_FILE_VERSION = 1;

/** A JSON value, the only thing an attr may be once it is in the file. */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** A Konva node as stored: what the clipboard copies, minus anything not JSON. */
export interface BoardFileNode {
  className: string;
  attrs: Record<string, Json>;
  /** Uploaded images only: the picture itself, as a data URL. */
  imageUrl?: string;
  label?: string;
}

/**
 * A panel without the parts that describe this session rather than the
 * board: whether it is selected or open, and an in-flight generation job,
 * which would reconnect to nothing.
 */
export type BoardFilePanel = Omit<PanelInstance, "isActive" | "isPanelOpen" | "job">;

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

/**
 * The board in `container` plus the stores, as a file. A container rather
 * than the stage so a test can pass a Konva.Group: jsdom has no Stage.
 */
export function serializeBoard(container: Konva.Container, now = new Date()): BoardFile {
  const records = useKonvaNodes.getState().nodes;
  // find() returns ascending z, so this array is already the paint order.
  const nodes = (container.find(".selectable") as Konva.Shape[]).map((n): BoardFileNode => {
    const rec = records[n.id()];
    return {
      className: n.getClassName(),
      attrs: plainAttrs(n.getAttrs()),
      ...(rec?.imageUrl ? { imageUrl: rec.imageUrl } : {}),
      ...(rec?.label ? { label: rec.label } : {}),
    };
  });
  const panels = useNodePanel
    .getState()
    .panels.map(({ isActive: _a, isPanelOpen: _o, job: _j, ...rest }) => rest);
  return {
    format: BOARD_FILE_FORMAT,
    version: BOARD_FILE_VERSION,
    savedAt: now.toISOString(),
    panels,
    nodes,
    frames: Object.values(useFrames.getState().frames),
    connections: useConnectionStore.getState().connections,
    topLayer: useLayerOrder.getState().topLayer,
  };
}

/** `PlaySpace 2026-10-18.json`, by the local date: what the user sees on their calendar. */
export function boardFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `PlaySpace ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

/**
 * Downloads the board. Returns false if the file could not be made, having
 * logged why; nothing is downloaded then, so there is never a partial file.
 */
export function saveBoardToFile(): boolean {
  try {
    const stage = boardStage.current;
    if (!stage) throw new Error("the board stage is not mounted");
    const now = new Date();
    const json = JSON.stringify(serializeBoard(stage, now));
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = boardFileName(now);
    a.click();
    // After the click has handed the URL to the download, not before.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  } catch (err) {
    console.error("[board] Could not save the board to a file:", err);
    return false;
  }
}

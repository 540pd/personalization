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
import {
  useNodePanel,
  type NodeKind,
  type PanelDraft,
  type PanelInstance,
  type PanelOutput,
} from "@/store/nodePanel.store";
import { useConnectionStore, type Connection } from "@/store/connection.store";
import { useFrames, type FrameRecord } from "@/store/frame.store";
import { useLayerOrder, type TopLayer } from "@/store/layerOrder.store";
import { useViewport } from "@/store/viewport.store";
import { boardStage } from "@/lib/canvas/boardStage";
import { boundsOf } from "@/lib/canvas/bounds";
import { downloadText } from "@/lib/dom/download";
import { canvasArea } from "../canvasArea";
import { fitTo } from "../components/Minimap/zoom";
import { unionBounds } from "../components/Minimap/world";
import { currentBounds } from "../components/Minimap/boardBounds";
import { canvasEvent } from "@/lib/canvas/events";
import { nodeEntry, type NodeEntry } from "./nodeEntry";

export const BOARD_FILE_FORMAT = "gcos-playspace";
export const BOARD_FILE_VERSION = 1;

/** A JSON value, the only thing an attr may be once it is in the file. */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

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

/**
 * The board in `container` plus the stores, as a file. A container rather
 * than the stage so a test can pass a Konva.Group: jsdom has no Stage.
 */
export function serializeBoard(container: Konva.Container, now = new Date()): BoardFile {
  // find() returns ascending z, so this array is already the paint order.
  const nodes = (container.find(".selectable") as Konva.Shape[]).map(
    (n): BoardFileNode => nodeEntry(n, plainAttrs(n.getAttrs())),
  );
  const panels = useNodePanel.getState().panels.map(toFilePanel);
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
    downloadText(boardFileName(now), json, "application/json");
    return true;
  } catch (err) {
    console.error("[board] Could not save the board to a file:", err);
    return false;
  }
}

// ── Open file (#199) ──────────────────────────────────────────────────────

/** Board listens; Open file emits it with a parsed file. */
export const loadBoardEvent = canvasEvent<BoardFile>("canvas:load");

export function requestLoadBoard(file: BoardFile): void {
  loadBoardEvent.emit(file);
}

/**
 * "Zoom to fit" after a load, frames included. The dock's Zoom to fit
 * measures nodes and panels only; here that would zoom in past a loaded
 * frame and leave it off screen, as if it had not come back.
 */
export function zoomToFitBoard(): void {
  const frames = Object.values(useFrames.getState().frames).map(boundsOf);
  const box = unionBounds([...currentBounds(), ...frames]);
  if (box) useViewport.setState(fitTo(box, canvasArea()));
}

/** `invalid`: not JSON, or not a PlaySpace board. `newer`: a version this build cannot read. */
export type BoardFileError = "invalid" | "newer";

export type ParseResult =
  | { ok: true; file: BoardFile }
  | { ok: false; error: BoardFileError };

const PROBLEMS: Record<"file" | "saved", Record<BoardFileError, string>> = {
  // A file the user chose in Open file (#199): said in a toast.
  file: {
    newer: "This board was saved by a newer version of PlaySpace.",
    invalid: "This file isn't a PlaySpace board.",
  },
  // The board saved across a reload (#203): said in the console.
  saved: {
    newer: "The saved board is from a newer version of PlaySpace and was not restored.",
    invalid: "The saved board is unreadable and was not restored.",
  },
};

/** What to tell the user when a board from `source` could not be read. */
export function boardFileProblem(error: BoardFileError, source: "file" | "saved"): string {
  return PROBLEMS[source][error];
}

const NODE_KINDS: readonly NodeKind[] = ["image", "video", "instruction", "compose"];
const OUTPUT_TYPES: readonly PanelOutput["type"][] = ["image", "video", "text"];
const NODE_CLASSES = ["Image", "BoardShape", "Text", "Rect"];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";

function skip(what: string, entry: unknown): null {
  console.warn(`[board] Skipped an invalid ${what} in the board file:`, entry);
  return null;
}

/**
 * Each reader copies only the fields it knows, so an unknown field in a file
 * is ignored rather than carried into a store, and returns null for an entry
 * it cannot use. One bad entry costs that entry, not the board.
 */
function readPanel(v: unknown): BoardFilePanel | null {
  if (!isObj(v) || !isStr(v.id) || !NODE_KINDS.includes(v.kind as NodeKind)) return skip("panel", v);
  if (!isNum(v.canvasX) || !isNum(v.canvasY) || !isNum(v.w) || !isNum(v.h)) return skip("panel", v);
  const panel: BoardFilePanel = {
    id: v.id, kind: v.kind as NodeKind, canvasX: v.canvasX, canvasY: v.canvasY, w: v.w, h: v.h,
  };
  if (isObj(v.output) && OUTPUT_TYPES.includes(v.output.type as PanelOutput["type"]) && isStr(v.output.value)) {
    panel.output = { type: v.output.type as PanelOutput["type"], value: v.output.value };
  }
  if (isStr(v.label)) panel.label = v.label;
  if (typeof v.labelAuto === "boolean") panel.labelAuto = v.labelAuto;
  if (isObj(v.draft) && isStr(v.draft.model) && isStr(v.draft.instruction)) {
    panel.draft = {
      model: v.draft.model,
      instruction: v.draft.instruction,
      ...(isObj(v.draft.settings) ? { settings: plainAttrs(v.draft.settings) as PanelDraft["settings"] } : {}),
    };
  }
  return panel;
}

function readNode(v: unknown): BoardFileNode | null {
  if (!isObj(v) || !NODE_CLASSES.includes(v.className as string) || !isObj(v.attrs)) return skip("node", v);
  const attrs = plainAttrs(v.attrs);
  if (!isStr(attrs.id) || !isNum(attrs.x) || !isNum(attrs.y)) return skip("node", v);
  // An image is its picture: without one there is nothing to draw.
  if (v.className === "Image" && !isStr(v.imageUrl)) return skip("node", v);
  return {
    className: v.className as string,
    attrs,
    ...(isStr(v.imageUrl) ? { imageUrl: v.imageUrl } : {}),
    ...(isStr(v.label) ? { label: v.label } : {}),
  };
}

/**
 * A Frame's auto layout: columns of ids (#230). A Frame saved with #225's flat
 * list of children reads as one child per column, which is how it looked.
 * Optional, so a file from before either reads as before, and a reader from
 * before it drops it and keeps the Frame as it is.
 */
function readLayout(v: unknown): Pick<FrameRecord, "layout"> {
  if (!isObj(v)) return {};
  const ids = (x: unknown): x is string[] => Array.isArray(x) && x.every(isStr);
  if (Array.isArray(v.columns) && v.columns.every(ids)) {
    const columns = (v.columns as string[][]).filter((c) => c.length);
    return columns.length ? { layout: { columns } } : {};
  }
  if (ids(v.children) && v.children.length) return { layout: { columns: v.children.map((c) => [c]) } };
  return {};
}

function readFrame(v: unknown): FrameRecord | null {
  if (!isObj(v) || !isStr(v.id) || !isStr(v.label)) return skip("frame", v);
  if (!isNum(v.canvasX) || !isNum(v.canvasY) || !isNum(v.canvasW) || !isNum(v.canvasH)) return skip("frame", v);
  return {
    id: v.id, canvasX: v.canvasX, canvasY: v.canvasY, canvasW: v.canvasW, canvasH: v.canvasH, label: v.label,
    ...(isStr(v.stroke) ? { stroke: v.stroke } : {}),
    ...readLayout(v.layout),
  };
}

function readConnection(v: unknown, panelIds: Set<string>, nodeIds: Set<string>): Connection | null {
  if (!isObj(v) || !isStr(v.id) || !isStr(v.fromNodeId) || !isStr(v.toNodeId)) return skip("wire", v);
  if (v.fromNodeType !== "panel" && v.fromNodeType !== "konva") return skip("wire", v);
  if (v.toNodeType !== "panel") return skip("wire", v);
  // A wire to a node that did not load would draw from or to nothing.
  const from = v.fromNodeType === "panel" ? panelIds : nodeIds;
  if (!from.has(v.fromNodeId) || !panelIds.has(v.toNodeId)) return skip("wire", v);
  return { id: v.id, fromNodeId: v.fromNodeId, fromNodeType: v.fromNodeType, toNodeId: v.toNodeId, toNodeType: "panel" };
}

/** Keeps the first entry for each id: two nodes sharing one would fight over its record. */
function readList<T extends { id: string }>(list: unknown, read: (v: unknown) => T | null, what: string): T[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const v of list) {
    const item = read(v);
    if (!item) continue;
    if (seen.has(item.id)) {
      skip(`${what} (duplicate id)`, v);
      continue;
    }
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/** A board file's text, checked and cleaned for loading. Never throws. */
export function parseBoardFile(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "invalid" };
  }
  if (!isObj(raw) || raw.format !== BOARD_FILE_FORMAT || !isNum(raw.version)) return { ok: false, error: "invalid" };
  if (raw.version > BOARD_FILE_VERSION) return { ok: false, error: "newer" };

  const panels = readList(raw.panels, readPanel, "panel");
  // Konva nodes are keyed by attrs.id, not a top-level id.
  const nodes = readList(
    raw.nodes,
    (v) => {
      const node = readNode(v);
      return node && { ...node, id: node.attrs.id as string };
    },
    "node",
  ).map(({ id: _id, ...node }) => node);
  const frames = readList(raw.frames, readFrame, "frame");
  const panelIds = new Set(panels.map((p) => p.id));
  const nodeIds = new Set(nodes.map((n) => n.attrs.id as string));
  const connections = readList(raw.connections, (v) => readConnection(v, panelIds, nodeIds), "wire");

  return {
    ok: true,
    file: {
      format: BOARD_FILE_FORMAT,
      version: BOARD_FILE_VERSION,
      savedAt: isStr(raw.savedAt) ? raw.savedAt : "",
      panels,
      nodes,
      frames,
      connections,
      topLayer: raw.topLayer === "canvas" ? "canvas" : "dom",
    },
  };
}

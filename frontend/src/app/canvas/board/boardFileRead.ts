// Open file (#199) and the restore after a reload (#203): a board file's text,
// checked and cleaned before anything reaches a store. Pure -- it imports
// only types and the format -- so the whole reader is testable without a
// board.

import type { NodeKind, PanelDraft, PanelOutput } from "@/store/nodePanel.store";
import type { Connection } from "@/store/connection.store";
import type { FrameRecord } from "@/store/frame.store";
import {
  BOARD_FILE_FORMAT,
  BOARD_FILE_VERSION,
  plainAttrs,
  type BoardFile,
  type BoardFileNode,
  type BoardFilePanel,
} from "./boardFileFormat";

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

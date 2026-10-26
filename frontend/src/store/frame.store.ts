import { create } from "zustand";
import { createSelection, type SelectionSlice } from "./selectionSlice";
import { saveFrameImagePositions } from "@/app/canvas/board/frameImageStorage";

const STORAGE_KEY = "gcos-frames";

function readFrames(): Record<string, FrameRecord> {
  if (typeof window === "undefined") return {};
  try {
    const frames = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as unknown;
    if (!frames || typeof frames !== "object" || Array.isArray(frames)) return {};
    return Object.fromEntries(Object.entries(frames).filter(([id, frame]) => {
      const f = frame as FrameRecord;
      return id === f?.id && typeof f.canvasX === "number" && typeof f.canvasY === "number" &&
        typeof f.canvasW === "number" && typeof f.canvasH === "number" && typeof f.label === "string";
    }));
  } catch {
    return {};
  }
}

function saveFrames(frames: Record<string, FrameRecord>): void {
  if (typeof window === "undefined") return;
  try {
    // Synchronous at dragend: an immediate refresh sees the final position.
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(frames));
    saveFrameImagePositions(frames);
  } catch (err) {
    console.warn("[frames] Could not save frames for reload.", err);
  }
}

// Frames: named backdrops that always paint behind every node.
//
// Their own store, not konvaNodes, because they are not on the main stage at
// all. The main stage's container moves between Z_INDEX.canvasBelow and
// canvasAbove as one unit, so nothing drawn on it can be reliably below the
// Create/Instruction/Video placeholders that sit between those two. Frames get
// Z_INDEX.frames and a stage of their own, which never flips.
//
// A frame is a backdrop, not a container: what moves with it is decided by
// containment when a drag starts. The exception is a frame with auto layout
// (#225), which keeps its children by id, in order.

/**
 * Auto layout: a row of columns, each a stack of children top to bottom
 * (#230). A plain row, as #225 made it, is one child per column.
 */
export interface FrameLayout {
  /**
   * Konva node and panel ids, by column. One whose node is gone is skipped,
   * and kept, so an undo that brings the node back finds it in its place.
   */
  columns: string[][];
}

export interface FrameRecord {
  id: string;
  /** Canvas units. canvasY is the TOP edge, as with KonvaNodeRecord. */
  canvasX: number;
  canvasY: number;
  canvasW: number;
  canvasH: number;
  label: string;
  /** Outline colour from the dock's Color (#159). Absent: the default. */
  stroke?: string;
  /** Set while auto layout is on (#225). */
  layout?: FrameLayout;
}

/** The rectangle being dragged out right now, in canvas units. */
export interface FrameDraft {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A frame's position and size, in canvas units. */
export type FrameBox = Pick<FrameRecord, "canvasX" | "canvasY" | "canvasW" | "canvasH">;

/** Live offset of a frame being dragged, in canvas units. */
export interface FrameDrag {
  dx: number;
  dy: number;
}

interface FrameState extends SelectionSlice {
  frames: Record<string, FrameRecord>;
  // selectedIds (SelectionSlice) is a set, not one id: Ctrl+A selects every
  // frame alongside the images, panels and wires, and one Delete has to take
  // all of them.
  draft: FrameDraft | null;
  /**
   * Set on every dragmove, cleared on dragend.
   *
   * The frame's own rect is moved by Konva, but its NAME is rendered from the
   * store -- so without this the label would not catch up until the drag
   * ended. Kept separate from `frames` on purpose: writing position there
   * mid-drag would rebuild the rects underneath the gesture.
   *
   * Keyed by id, because a multi-frame selection drags every one of them at
   * once and each name has to keep up with its own rect.
   */
  drag: Record<string, FrameDrag>;
  /**
   * The live box of a frame being resized, set on every transform and
   * cleared on transformend (#156).
   *
   * The `drag` of a resize: the rect is scaled by Konva and its record only
   * updated at the end, so without this the name sat at the old top-left and
   * width for the whole gesture. Separate from `frames` for the same reason.
   */
  resize: Record<string, FrameBox>;

  upsert: (frame: FrameRecord) => void;
  remove: (id: string) => void;
  selectAll: () => void;
  setDraft: (draft: FrameDraft | null) => void;
  setDrag: (id: string, drag: FrameDrag) => void;
  clearDrag: () => void;
  setResize: (id: string, box: FrameBox) => void;
  clearResize: (id: string) => void;
  /** Replace every frame wholesale. Used by the shared undo timeline. */
  replaceAll: (frames: Record<string, FrameRecord>) => void;
}

export const useFrames = create<FrameState>((set, get) => ({
  frames: readFrames(),
  draft: null,
  drag: {},
  resize: {},

  upsert: (frame) =>
    set((s) => {
      const frames = { ...s.frames, [frame.id]: { ...s.frames[frame.id], ...frame } };
      saveFrames(frames);
      return { frames };
    }),
  remove: (id) =>
    set((s) => {
      const next = { ...s.frames };
      delete next[id];
      saveFrames(next);
      // Deleted mid-resize: drop its live box too (#183).
      const resize = { ...s.resize };
      delete resize[id];
      return { frames: next, selectedIds: s.selectedIds.filter((sid) => sid !== id), resize };
    }),
  // Same selection, same array (createSelection): a fresh reference on every
  // mousedown would re-render FrameLayer in the middle of a drag.
  ...createSelection(set),
  selectAll: () => get().setSelection(Object.keys(get().frames)),
  setDraft: (draft) => set({ draft }),
  setDrag: (id, drag) => set((s) => ({ drag: { ...s.drag, [id]: drag } })),
  clearDrag: () => set({ drag: {} }),
  setResize: (id, box) => set((s) => ({ resize: { ...s.resize, [id]: box } })),
  clearResize: (id) =>
    set((s) => {
      if (!(id in s.resize)) return s;
      const next = { ...s.resize };
      delete next[id];
      return { resize: next };
    }),
  replaceAll: (frames) =>
    set((s) => {
      saveFrames(frames);
      return {
        frames,
        // An undo can remove frames out from under the selection.
        selectedIds: s.selectedIds.filter((sid) => !!frames[sid]),
        // Live resize boxes are stale after an undo / redo (#183).
        resize: {},
      };
    }),
}));

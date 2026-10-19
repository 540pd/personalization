import { create } from "zustand";

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

interface FrameState {
  frames: Record<string, FrameRecord>;
  /**
   * A set, not one id: Ctrl+A selects every frame alongside the images, panels
   * and wires, and one Delete has to take all of them.
   */
  selectedIds: string[];
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
  /** Select exactly this frame, or nothing when passed null. */
  select: (id: string | null) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setDraft: (draft: FrameDraft | null) => void;
  setDrag: (id: string, drag: FrameDrag) => void;
  clearDrag: () => void;
  setResize: (id: string, box: FrameBox) => void;
  clearResize: (id: string) => void;
  /** Replace every frame wholesale. Used by the shared undo timeline. */
  replaceAll: (frames: Record<string, FrameRecord>) => void;
}

export const useFrames = create<FrameState>((set) => ({
  frames: {},
  selectedIds: [],
  draft: null,
  drag: {},
  resize: {},

  upsert: (frame) =>
    set((s) => ({ frames: { ...s.frames, [frame.id]: { ...s.frames[frame.id], ...frame } } })),
  remove: (id) =>
    set((s) => {
      const next = { ...s.frames };
      delete next[id];
      return { frames: next, selectedIds: s.selectedIds.filter((sid) => sid !== id) };
    }),
  select: (id) =>
    set((s) => {
      // Same selection, same array: a fresh reference on every mousedown would
      // re-render FrameLayer in the middle of a drag.
      if (id ? s.selectedIds.length === 1 && s.selectedIds[0] === id : !s.selectedIds.length) {
        return s;
      }
      return { selectedIds: id ? [id] : [] };
    }),
  selectAll: () => set((s) => ({ selectedIds: Object.keys(s.frames) })),
  clearSelection: () => set({ selectedIds: [] }),
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
    set((s) => ({
      frames,
      // An undo can remove frames out from under the selection.
      selectedIds: s.selectedIds.filter((sid) => !!frames[sid]),
    })),
}));

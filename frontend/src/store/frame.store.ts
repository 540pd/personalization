import { create } from "zustand";

// Frames: named backdrops that always paint behind every node.
//
// Their own store, not konvaNodes, because they are not on the main stage at
// all. The main stage's container moves between Z_INDEX.canvasBelow and
// canvasAbove as one unit, so nothing drawn on it can be reliably below the
// Create/Instruction/Video placeholders that sit between those two. Frames get
// Z_INDEX.frames and a stage of their own, which never flips.
//
// A frame is a backdrop, not a container: moving one moves only the frame.

export interface FrameRecord {
  id: string;
  /** Canvas units. canvasY is the TOP edge, as with KonvaNodeRecord. */
  canvasX: number;
  canvasY: number;
  canvasW: number;
  canvasH: number;
  label: string;
}

/** The rectangle being dragged out right now, in canvas units. */
export interface FrameDraft {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Live offset of the frame being dragged, in canvas units. */
export interface FrameDrag {
  id: string;
  dx: number;
  dy: number;
}

interface FrameState {
  frames: Record<string, FrameRecord>;
  selectedId: string | null;
  draft: FrameDraft | null;
  /**
   * Set on every dragmove, cleared on dragend.
   *
   * The frame's own rect is moved by Konva, but its NAME is rendered from the
   * store -- so without this the label would not catch up until the drag
   * ended. Kept separate from `frames` on purpose: writing position there
   * mid-drag would rebuild the rects underneath the gesture.
   */
  drag: FrameDrag | null;

  upsert: (frame: FrameRecord) => void;
  remove: (id: string) => void;
  select: (id: string | null) => void;
  setDraft: (draft: FrameDraft | null) => void;
  setDrag: (drag: FrameDrag | null) => void;
  /** Replace every frame wholesale. Used by the shared undo timeline. */
  replaceAll: (frames: Record<string, FrameRecord>) => void;
}

export const useFrames = create<FrameState>((set) => ({
  frames: {},
  selectedId: null,
  draft: null,
  drag: null,

  upsert: (frame) =>
    set((s) => ({ frames: { ...s.frames, [frame.id]: { ...s.frames[frame.id], ...frame } } })),
  remove: (id) =>
    set((s) => {
      const next = { ...s.frames };
      delete next[id];
      return { frames: next, selectedId: s.selectedId === id ? null : s.selectedId };
    }),
  select: (id) => set({ selectedId: id }),
  setDraft: (draft) => set({ draft }),
  setDrag: (drag) => set({ drag }),
  replaceAll: (frames) =>
    set((s) => ({
      frames,
      selectedId: s.selectedId && frames[s.selectedId] ? s.selectedId : null,
    })),
}));

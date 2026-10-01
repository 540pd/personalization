import { create } from "zustand";

interface KonvaSelectionState {
  nodeIds: string[];
  canvasX: number;
  canvasY: number;
  canvasW: number;
  canvasH: number;
  select:          (id: string, x: number, y: number, w: number, h: number) => void;
  addToSelection:  (id: string, x: number, y: number, w: number, h: number) => void;
  removeFromSelection: (id: string) => void;
  update:          (x: number, y: number, w: number, h: number) => void;
  deselect:        () => void;
}

export const useKonvaSelection = create<KonvaSelectionState>((set) => ({
  nodeIds: [],
  canvasX: 0,
  canvasY: 0,
  canvasW: 0,
  canvasH: 0,

  select: (id, x, y, w, h) =>
    set({ nodeIds: [id], canvasX: x, canvasY: y, canvasW: w, canvasH: h }),

  addToSelection: (id, x, y, w, h) =>
    set((s) =>
      s.nodeIds.includes(id)
        ? s
        : { nodeIds: [...s.nodeIds, id], canvasX: x, canvasY: y, canvasW: w, canvasH: h }
    ),

  removeFromSelection: (id) =>
    set((s) => ({ nodeIds: s.nodeIds.filter((n) => n !== id) })),

  update:   (x, y, w, h) => set({ canvasX: x, canvasY: y, canvasW: w, canvasH: h }),
  deselect: ()            => set({ nodeIds: [] }),
}));

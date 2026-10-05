import { create } from "zustand";

// Tracks which Konva nodes are selected. Node geometry lives solely in
// konvaNodes.store — keeping a second copy here let the two drift apart.
interface KonvaSelectionState {
  nodeIds: string[];
  select:              (id: string) => void;
  addToSelection:      (id: string) => void;
  removeFromSelection: (id: string) => void;
  deselect:            () => void;
}

export const useKonvaSelection = create<KonvaSelectionState>((set) => ({
  nodeIds: [],

  select: (id) => set({ nodeIds: [id] }),

  addToSelection: (id) =>
    set((s) => (s.nodeIds.includes(id) ? s : { nodeIds: [...s.nodeIds, id] })),

  removeFromSelection: (id) =>
    set((s) => ({ nodeIds: s.nodeIds.filter((n) => n !== id) })),

  deselect: () => set({ nodeIds: [] }),
}));

import { create } from "zustand";

// Tracks the currently selected Konva node's canvas-space position and size
// so HTML overlays (ports) can be positioned over it without being part of
// the Konva layer.
interface KonvaSelectionState {
  nodeId:  string | null;
  canvasX: number; // top-left x in canvas coordinates
  canvasY: number; // top-left y in canvas coordinates
  canvasW: number; // effective width  (width  × scaleX)
  canvasH: number; // effective height (height × scaleY)
  select:  (id: string, x: number, y: number, w: number, h: number) => void;
  update:  (x: number, y: number, w: number, h: number) => void;
  deselect: () => void;
}

export const useKonvaSelection = create<KonvaSelectionState>((set) => ({
  nodeId:  null,
  canvasX: 0,
  canvasY: 0,
  canvasW: 0,
  canvasH: 0,
  select:  (id, x, y, w, h) => set({ nodeId: id, canvasX: x, canvasY: y, canvasW: w, canvasH: h }),
  update:  (x, y, w, h)     => set({ canvasX: x, canvasY: y, canvasW: w, canvasH: h }),
  deselect: ()               => set({ nodeId: null }),
}));

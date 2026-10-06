import { create } from "zustand";

export interface KonvaNodeRecord {
  id: string;
  canvasX: number;
  canvasY: number;
  canvasW: number;
  canvasH: number;
  // Konva stacking index. Published so DOM overlays can tell which nodes sit
  // above which — a port is hidden when a higher node covers it.
  z?: number;
  imageUrl?: string; // object URL for uploaded images — used as reference by downstream nodes
}

interface KonvaNodesState {
  nodes: Record<string, KonvaNodeRecord>;
  upsert: (node: KonvaNodeRecord) => void;
  remove: (id: string) => void;
}

export const useKonvaNodes = create<KonvaNodesState>((set) => ({
  nodes: {},
  upsert: (node) =>
    set((s) => ({ nodes: { ...s.nodes, [node.id]: { ...s.nodes[node.id], ...node } } })),
  remove: (id) =>
    set((s) => {
      const next = { ...s.nodes };
      delete next[id];
      return { nodes: next };
    }),
}));

import { create } from "zustand";

export interface KonvaNodeRecord {
  id: string;
  canvasX: number;
  canvasY: number;
  canvasW: number;
  canvasH: number;
}

interface KonvaNodesState {
  nodes: Record<string, KonvaNodeRecord>;
  upsert: (node: KonvaNodeRecord) => void;
  remove: (id: string) => void;
}

export const useKonvaNodes = create<KonvaNodesState>((set) => ({
  nodes: {},
  upsert: (node) =>
    set((s) => ({ nodes: { ...s.nodes, [node.id]: node } })),
  remove: (id) =>
    set((s) => {
      const next = { ...s.nodes };
      delete next[id];
      return { nodes: next };
    }),
}));

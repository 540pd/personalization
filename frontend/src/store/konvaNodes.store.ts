import { create } from "zustand";
import type { ShapeKind } from "./tool.store";
import type { ShapeStyle } from "@/app/canvas/board/shapeStyle";
import type { TextStyle } from "@/app/canvas/board/text";

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
  // Display name shown above the node when selected. Deliberately not called
  // "name": Konva nodes already have a load-bearing .name() ("selectable")
  // and the two would be easy to confuse at a call site.
  label?: string;
  // Set on shapes drawn from the Shapes menu. A shape is drawing, not
  // content, so it is never a generation source: no output port.
  shape?: ShapeKind;
  // Set on text placed with the Text tool. Like a shape, not a generation
  // source: no output port.
  text?: boolean;
  // Lines and arrows only: where the two ends are, in canvas units. The box
  // above says where the line is; this says which way it runs, which is what
  // the endpoint handles need.
  ends?: { a: { x: number; y: number }; b: { x: number; y: number }; bend: number };
  // Filled shapes only: their Color, Fill and Stroke, which the style bar
  // above a selected shape shows (#161).
  style?: ShapeStyle;
  // Text only: what the style bar shows for it (#164).
  textStyle?: TextStyle;
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

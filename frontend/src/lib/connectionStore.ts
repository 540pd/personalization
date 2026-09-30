import { create } from "zustand";

export interface Connection {
  id: string;
  fromNodeId: string;       // NodePanel node ID (output port, left edge)
  toNodeId: string;         // NodePanel or Konva node ID (input port, right edge)
  toNodeType: "panel" | "konva";
}

export interface DragState {
  fromNodeId: string;
  cursorX: number;
  cursorY: number;
}

interface ConnectionState {
  connections:      Connection[];
  drag:             DragState | null;
  selectedId:       string | null;
  startDrag:        (fromNodeId: string, x: number, y: number) => void;
  updateDrag:       (x: number, y: number) => void;
  commitConnection: (toNodeId: string, toNodeType: "panel" | "konva") => void;
  cancelDrag:       () => void;
  selectConnection: (id: string) => void;
  deselectConnection: () => void;
  removeConnection: (id: string) => void;
  removeForNode:    (nodeId: string) => void;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  connections: [],
  drag:        null,
  selectedId:  null,

  startDrag: (fromNodeId, x, y) =>
    set({ drag: { fromNodeId, cursorX: x, cursorY: y }, selectedId: null }),

  updateDrag: (x, y) =>
    set((s) => s.drag ? { drag: { ...s.drag, cursorX: x, cursorY: y } } : s),

  commitConnection: (toNodeId, toNodeType) => {
    const { drag, connections } = get();
    if (!drag || drag.fromNodeId === toNodeId) { set({ drag: null }); return; }
    const exists = connections.some(
      (c) => c.fromNodeId === drag.fromNodeId && c.toNodeId === toNodeId
    );
    if (!exists) {
      const newId = crypto.randomUUID();
      set((s) => ({
        connections: [...s.connections, {
          id: newId,
          fromNodeId: drag.fromNodeId,
          toNodeId,
          toNodeType,
        }],
        drag: null,
        selectedId: newId, // auto-select newly created connection
      }));
    } else {
      set({ drag: null });
    }
  },

  cancelDrag: () => set({ drag: null }),

  selectConnection:   (id) => set({ selectedId: id }),
  deselectConnection: ()   => set({ selectedId: null }),

  removeConnection: (id) =>
    set((s) => ({
      connections: s.connections.filter((c) => c.id !== id),
      selectedId:  s.selectedId === id ? null : s.selectedId,
    })),

  removeForNode: (nodeId) =>
    set((s) => {
      const remaining = s.connections.filter(
        (c) => c.fromNodeId !== nodeId && c.toNodeId !== nodeId
      );
      const removedIds = new Set(s.connections.filter(
        (c) => c.fromNodeId === nodeId || c.toNodeId === nodeId
      ).map((c) => c.id));
      return {
        connections: remaining,
        selectedId: removedIds.has(s.selectedId ?? "") ? null : s.selectedId,
      };
    }),
}));

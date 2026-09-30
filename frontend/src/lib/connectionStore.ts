import { create } from "zustand";

export interface Connection {
  id: string;
  fromNodeId:   string;
  fromNodeType: "panel" | "konva";
  toNodeId:     string;
  toNodeType:   "panel";  // only panels have input ports
}

export interface DragState {
  fromNodeId:   string;
  fromNodeType: "panel" | "konva";
  cursorX: number;
  cursorY: number;
}

interface ConnectionState {
  connections:           Connection[];
  drag:                  DragState | null;
  selectedIds:           string[];
  startDrag:             (fromNodeId: string, fromNodeType: "panel" | "konva", x: number, y: number) => void;
  updateDrag:            (x: number, y: number) => void;
  commitConnection:      (toNodeId: string) => void;
  cancelDrag:            () => void;
  selectConnection:      (id: string) => void;
  addConnectionToSelection: (id: string) => void;
  deselectConnection:    () => void;
  removeConnection:      (id: string) => void;
  removeForNode:         (nodeId: string) => void;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  connections: [],
  drag:        null,
  selectedIds: [],

  startDrag: (fromNodeId, fromNodeType, x, y) =>
    set({ drag: { fromNodeId, fromNodeType, cursorX: x, cursorY: y }, selectedIds: [] }),

  updateDrag: (x, y) =>
    set((s) => s.drag ? { drag: { ...s.drag, cursorX: x, cursorY: y } } : s),

  commitConnection: (toNodeId) => {
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
          fromNodeId:   drag.fromNodeId,
          fromNodeType: drag.fromNodeType,
          toNodeId,
          toNodeType: "panel" as const,
        }],
        drag: null,
        selectedIds: [newId], // auto-select newly created connection
      }));
    } else {
      set({ drag: null });
    }
  },

  cancelDrag: () => set({ drag: null }),

  selectConnection:      (id) => set({ selectedIds: [id] }),
  addConnectionToSelection: (id) =>
    set((s) =>
      s.selectedIds.includes(id) ? s : { selectedIds: [...s.selectedIds, id] }
    ),
  deselectConnection: () => set({ selectedIds: [] }),

  removeConnection: (id) =>
    set((s) => ({
      connections: s.connections.filter((c) => c.id !== id),
      selectedIds: s.selectedIds.filter((sid) => sid !== id),
    })),

  removeForNode: (nodeId) =>
    set((s) => {
      const removedIds = new Set(
        s.connections
          .filter((c) => c.fromNodeId === nodeId || c.toNodeId === nodeId)
          .map((c) => c.id)
      );
      return {
        connections: s.connections.filter((c) => !removedIds.has(c.id)),
        selectedIds: s.selectedIds.filter((sid) => !removedIds.has(sid)),
      };
    }),
}));

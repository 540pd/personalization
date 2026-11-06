import { create } from "zustand";
import { createSelection, type SelectionSlice } from "./selectionSlice";

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
  /** Set when an existing wire was picked up by its input end to move (#458). */
  movingId?:    string;
}

interface ConnectionState extends SelectionSlice {
  connections:           Connection[];
  drag:                  DragState | null;
  startDrag:             (fromNodeId: string, fromNodeType: "panel" | "konva", x: number, y: number) => void;
  updateDrag:            (x: number, y: number) => void;
  /** Pick up a wire by its input end; it keeps its source and follows the pointer (#458). */
  startMove:             (connectionId: string, x: number, y: number) => void;
  /**
   * End the drag on a node's input. A new wire is added; a moved one goes
   * there. Self-links and duplicates are refused: a new one is dropped, and a
   * moved one is removed rather than doubled.
   */
  commitConnection:      (toNodeId: string) => void;
  /** End the drag over nothing: a new wire is dropped, a moved one removed. */
  dropNowhere:           () => void;
  /** Escape or a lost pointer: as if the drag never started. */
  cancelDrag:            () => void;
  selectAll:             () => void;
  removeConnection:      (id: string) => void;
  removeForNode:         (nodeId: string) => void;
  /**
   * Add copies of `sources` with both ends re-pointed through `idMap`, and make
   * them the selection. A wire with an end missing from the map is skipped.
   */
  pasteConnections:      (sources: Connection[], idMap: Record<string, string>) => void;
  /** Replace every connection wholesale. Used by the shared undo timeline. */
  replaceConnections:    (connections: Connection[]) => void;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  connections: [],
  drag:        null,

  startDrag: (fromNodeId, fromNodeType, x, y) =>
    set({ drag: { fromNodeId, fromNodeType, cursorX: x, cursorY: y }, selectedIds: [] }),

  updateDrag: (x, y) =>
    set((s) => s.drag ? { drag: { ...s.drag, cursorX: x, cursorY: y } } : s),

  startMove: (connectionId, x, y) => {
    const conn = get().connections.find((c) => c.id === connectionId);
    if (!conn) return;
    set({
      drag: { fromNodeId: conn.fromNodeId, fromNodeType: conn.fromNodeType, cursorX: x, cursorY: y, movingId: conn.id },
      selectedIds: [],
    });
  },

  commitConnection: (toNodeId) => {
    const { drag, connections } = get();
    if (drag?.movingId) {
      const moving = connections.find((c) => c.id === drag.movingId);
      if (!moving || moving.toNodeId === toNodeId) { set({ drag: null }); return; }
      const refused = toNodeId === drag.fromNodeId || connections.some(
        (c) => c.id !== moving.id && c.fromNodeId === drag.fromNodeId && c.toNodeId === toNodeId
      );
      set((s) => ({
        connections: refused
          ? s.connections.filter((c) => c.id !== moving.id)
          : s.connections.map((c) => (c.id === moving.id ? { ...c, toNodeId } : c)),
        drag: null,
        selectedIds: refused ? [] : [moving.id],
      }));
      return;
    }
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

  dropNowhere: () => {
    const { drag } = get();
    if (!drag?.movingId) { set({ drag: null }); return; }
    const id = drag.movingId;
    set((s) => ({ connections: s.connections.filter((c) => c.id !== id), drag: null }));
  },

  cancelDrag: () => set({ drag: null }),

  ...createSelection(set),
  selectAll: () => get().setSelection(get().connections.map((c) => c.id)),

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

  pasteConnections: (sources, idMap) => {
    const copies = sources
      .filter((c) => idMap[c.fromNodeId] && idMap[c.toNodeId])
      .map((c): Connection => ({
        ...c,
        id: crypto.randomUUID(),
        fromNodeId: idMap[c.fromNodeId],
        toNodeId:   idMap[c.toNodeId],
      }));
    set((s) => ({
      connections: [...s.connections, ...copies],
      selectedIds: copies.map((c) => c.id),
    }));
  },

  replaceConnections: (connections) => set({ connections, selectedIds: [] }),
}));

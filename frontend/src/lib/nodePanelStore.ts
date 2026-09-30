import { create } from "zustand";

export interface PanelInstance {
  id: string;
  canvasX: number;
  canvasY: number;
  // 3-state: inactive → active (transformer) → panel-open (transformer + panel)
  isActive:    boolean;
  isPanelOpen: boolean;
}

// Snapshot type for position undo/redo.
type PosSnap = { id: string; canvasX: number; canvasY: number };

interface NodePanelState {
  panels:      PanelInstance[];
  selectedId:  string | null;
  // Position undo/redo (tracks moves only, not state transitions).
  posHistory:      PosSnap[][];
  posHistoryIdx:   number;
  addPanel:        (cx: number, cy: number) => void;
  removePanel:     (id: string) => void;
  activatePanel:   (id: string) => void; // inactive → active (transformer, no panel)
  openPanel:       (id: string) => void; // active → panel-open
  closePanel:      (id: string) => void; // panel-open → active
  closeAllPanels:  () => void;           // everything → inactive
  setCanvasPos:    (id: string, x: number, y: number) => void;
  selectPanel:     (id: string | null) => void;
  savePosSnapshot: () => void;           // call after each completed drag
  undoPos:         () => void;
  redoPos:         () => void;
  clearAll:        () => void;
}

let _nextId = 1;

function makeSnap(panels: PanelInstance[]): PosSnap[] {
  return panels.map(({ id, canvasX, canvasY }) => ({ id, canvasX, canvasY }));
}

function applySnap(panels: PanelInstance[], snap: PosSnap[]): PanelInstance[] {
  return panels.map((p) => {
    const s = snap.find((e) => e.id === p.id);
    return s ? { ...p, canvasX: s.canvasX, canvasY: s.canvasY } : p;
  });
}

export const useNodePanel = create<NodePanelState>((set, get) => ({
  panels:         [],
  selectedId:     null,
  posHistory:     [],
  posHistoryIdx:  -1,

  // First creation: lands in panel-open state. All others go inactive.
  // Saves an initial position snapshot so the first move can be undone.
  addPanel: (cx, cy) =>
    set((s) => {
      const newId = `panel-${_nextId++}`;
      const newPanels = [
        ...s.panels.map((p) => ({ ...p, isActive: false, isPanelOpen: false })),
        { id: newId, canvasX: cx, canvasY: cy, isActive: true, isPanelOpen: true },
      ];
      const snap = makeSnap(newPanels);
      const history = [...s.posHistory.slice(0, s.posHistoryIdx + 1), snap];
      return {
        selectedId:    newId,
        panels:        newPanels,
        posHistory:    history,
        posHistoryIdx: history.length - 1,
      };
    }),

  removePanel: (id) =>
    set((s) => ({
      panels:     s.panels.filter((p) => p.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),

  // inactive → active: show transformer border, no panel.
  activatePanel: (id) =>
    set((s) => ({
      selectedId: id,
      panels: s.panels.map((p) =>
        p.id === id
          ? { ...p, isActive: true,  isPanelOpen: false }
          : { ...p, isActive: false, isPanelOpen: false }
      ),
    })),

  // active → panel-open: show panel alongside transformer.
  openPanel: (id) =>
    set((s) => ({
      selectedId: id,
      panels: s.panels.map((p) =>
        p.id === id
          ? { ...p, isActive: true,  isPanelOpen: true  }
          : { ...p, isActive: false, isPanelOpen: false }
      ),
    })),

  // panel-open → active: collapse panel, transformer stays.
  closePanel: (id) =>
    set((s) => ({
      panels: s.panels.map((p) =>
        p.id === id ? { ...p, isPanelOpen: false } : p
      ),
    })),

  // everything → inactive: placeholders stay on canvas.
  closeAllPanels: () =>
    set((s) => ({
      selectedId: null,
      panels: s.panels.map((p) => ({ ...p, isActive: false, isPanelOpen: false })),
    })),

  setCanvasPos: (id, x, y) =>
    set((s) => ({
      panels: s.panels.map((p) => (p.id === id ? { ...p, canvasX: x, canvasY: y } : p)),
    })),

  selectPanel: (id) => set({ selectedId: id }),

  // Save current positions to the undo stack (call once per completed drag).
  savePosSnapshot: () =>
    set((s) => {
      const snap = makeSnap(s.panels);
      const history = [...s.posHistory.slice(0, s.posHistoryIdx + 1), snap];
      const trimmed = history.length > 20 ? history.slice(-20) : history;
      return { posHistory: trimmed, posHistoryIdx: trimmed.length - 1 };
    }),

  undoPos: () =>
    set((s) => {
      if (s.posHistoryIdx <= 0) return s;
      const newIdx = s.posHistoryIdx - 1;
      return {
        posHistoryIdx: newIdx,
        panels: applySnap(s.panels, s.posHistory[newIdx]),
      };
    }),

  redoPos: () =>
    set((s) => {
      if (s.posHistoryIdx >= s.posHistory.length - 1) return s;
      const newIdx = s.posHistoryIdx + 1;
      return {
        posHistoryIdx: newIdx,
        panels: applySnap(s.panels, s.posHistory[newIdx]),
      };
    }),

  clearAll: () => set({ panels: [], selectedId: null, posHistory: [], posHistoryIdx: -1 }),
}));

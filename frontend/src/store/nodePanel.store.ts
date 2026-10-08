import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_ASPECT_RATIO, placeholderSize } from "@/constants/canvas.constants";

// What a panel node generates. The dock already offers all three
// (tool.store.ts declares generate-instruction and generate-video, and both
// sit in GENERATE_IDS), but only "image" is wired up so far.
//
// One discriminated record rather than one store per kind: placement, drag,
// resize, selection, ports, connections, labels and the 3-state lifecycle are
// identical across kinds, and duplicating them is how the same bug gets fixed
// three times.
export type NodeKind = "image" | "video" | "instruction";

// A node's generated result. Typed rather than a bare URL string because a
// video needs a <video> and an instruction node produces text, not a URL --
// and because what a node contributes to a downstream generation depends on
// which of those it is.
export interface PanelOutput {
  type: "image" | "video" | "text";
  value: string;
}

export interface PanelInstance {
  id: string;
  kind: NodeKind;
  canvasX: number;
  canvasY: number;
  // 3-state: inactive → active (transformer) → panel-open (transformer + panel)
  isActive:    boolean;
  isPanelOpen: boolean;
  // Placeholder size in CANVAS units (synced from SinglePanel). Note canvasY
  // is the vertical CENTRE of the placeholder, not its top edge — unlike
  // KonvaNodeRecord, where canvasY is the top.
  w: number;
  h: number;
  // Set once a generation lands. Used as a reference by downstream nodes.
  output?: PanelOutput;
  // Id of an in-flight asynchronous generation. Persisted on the node so a
  // page reload resumes polling instead of losing the job.
  job?: string;
  // Display name shown above the node when selected, and the name this node is
  // referred to by when it feeds a downstream generation. Derived from the
  // instruction on first generate; renameable.
  label?: string;
}

interface NodePanelState {
  panels:      PanelInstance[];
  selectedId:  string | null;
  addPanel:        (cx: number, cy: number, kind?: NodeKind) => void;
  removePanel:     (id: string) => void;
  activatePanel:   (id: string) => void; // inactive → active (transformer, no panel)
  raisePanel:      (id: string) => void; // move to the top of the paint order
  openPanel:       (id: string) => void; // active → panel-open
  closePanel:      (id: string) => void; // panel-open → active
  closeAllPanels:  () => void;           // everything → inactive
  setCanvasPos:    (id: string, x: number, y: number) => void;
  selectPanel:     (id: string | null) => void;
  /** Replace every panel wholesale. Used by the shared undo timeline. */
  replaceAll:      (panels: PanelInstance[]) => void;
  clearAll:        () => void;
  setSize:         (id: string, w: number, h: number) => void;
  setOutput:       (id: string, output: PanelOutput) => void;
  /** Record or clear an in-flight job. */
  setJob:          (id: string, job: string | undefined) => void;
  setLabel:        (id: string, label: string) => void;
}

let _nextId = 1;

export const useNodePanel = create<NodePanelState>()(
  persist(
    (set, get) => ({
  panels:         [],
  selectedId:     null,

  // First creation: lands in panel-open state. All others go inactive.
  // The caller commits to the shared history afterwards, so creating a node
  // is itself undoable — it was not, before the two stacks merged.
  addPanel: (cx, cy, kind = "image") =>
    set((s) => {
      const newId = `panel-${_nextId++}`;
      const newPanels = [
        ...s.panels.map((p) => ({ ...p, isActive: false, isPanelOpen: false })),
        // Seeded from the same helper SinglePanel uses, so the node does not
        // flash at one size then resize on mount.
        { id: newId, kind, canvasX: cx, canvasY: cy, isActive: true, isPanelOpen: true,
          ...placeholderSize(DEFAULT_ASPECT_RATIO) },
      ];
      return { selectedId: newId, panels: newPanels };
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

  // Move a panel to the end of the array. Every placeholder renders at the
  // same z-index, so array order IS paint order: last rendered wins. Called on
  // drag rather than on click, matching Board.tsx's rule for Konva nodes --
  // moving a node is a deliberate edit, merely clicking one should not reorder
  // it. Position history is keyed by id, so reordering does not disturb undo.
  raisePanel: (id) =>
    set((s) => {
      const i = s.panels.findIndex((p) => p.id === id);
      if (i === -1 || i === s.panels.length - 1) return s;
      const next = s.panels.slice();
      next.push(next.splice(i, 1)[0]);
      return { panels: next };
    }),

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
  replaceAll: (panels) => set({ panels }),

  clearAll: () => set({ panels: [], selectedId: null }),

  setSize: (id, w, h) =>
    set((s) => {
      const panel = s.panels.find((p) => p.id === id);
      if (!panel || (panel.w === w && panel.h === h)) return s;
      return { panels: s.panels.map((p) => p.id === id ? { ...p, w, h } : p) };
    }),

  setOutput: (id, output) =>
    set((s) => ({
      // An arriving result ends the job it came from.
      panels: s.panels.map((p) => p.id === id ? { ...p, output, job: undefined } : p),
    })),

  setJob: (id, job) =>
    set((s) => ({
      panels: s.panels.map((p) => p.id === id ? { ...p, job } : p),
    })),

  setLabel: (id, label) =>
    set((s) => ({
      panels: s.panels.map((p) => p.id === id ? { ...p, label } : p),
    })),
    }),
    {
      name: "gcos-node-panels",
      // Only persist canvas data; UI-open flags and selectedId reset on load.
      partialize: (s) => ({ panels: s.panels }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Reset interaction flags that shouldn't survive a reload.
        state.panels = state.panels.map((p) => ({
          ...p,
          isActive: false,
          isPanelOpen: false,
        }));
        // Keep _nextId ahead of all restored IDs to avoid collisions.
        const maxNum = state.panels.reduce((max, p) => {
          const n = Number(p.id.replace("panel-", ""));
          return isNaN(n) ? max : Math.max(max, n);
        }, 0);
        if (maxNum >= _nextId) _nextId = maxNum + 1;
      },
    }
  )
);

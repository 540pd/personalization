import { create } from "zustand";
import type { NodeSettings } from "@/app/canvas/components/NodePanel/nodeKinds";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
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

/**
 * What the user has typed and chosen in a node's panel. Held here rather than
 * in the component so a copy of the node can carry it.
 */
export interface PanelDraft {
  model: string;
  instruction: string;
  // Unset until a setting is first changed; the kind's defaults apply.
  settings?: NodeSettings;
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
  // Unset until the user first edits the panel; the kind's defaults apply.
  draft?: PanelDraft;
}

/** Where a variant copy goes and what it shows. Everything else is the source's. */
export interface VariantPlacement {
  canvasX: number;
  canvasY: number;
  output: PanelOutput;
  label: string;
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
  activateAll:     () => void;           // everything → active (Ctrl+A)
  togglePanel:     (id: string) => void; // Shift/Ctrl+click: add to / drop from the selection
  removeActive:    () => void;           // remove every active panel (Delete)
  /**
   * Paste copies of `sources`, offset by `offset` canvas units, as the new
   * selection. Returns old id → new id so wires can be re-pointed at the copies.
   * Labels are taken as given: the caller makes them unique board-wide.
   */
  pastePanels:     (sources: PanelInstance[], offset: number) => Record<string, string>;
  setCanvasPos:    (id: string, x: number, y: number) => void;
  selectPanel:     (id: string | null) => void;
  /**
   * Replace every panel wholesale. Used by the shared undo timeline. A panel
   * that still exists keeps its current draft: typing is not an undo step, so
   * undoing a move must not revert the instruction being written.
   */
  replaceAll:      (panels: PanelInstance[]) => void;
  clearAll:        () => void;
  setSize:         (id: string, w: number, h: number) => void;
  setOutput:       (id: string, output: PanelOutput) => void;
  /** Record or clear an in-flight job. */
  setJob:          (id: string, job: string | undefined) => void;
  setLabel:        (id: string, label: string) => void;
  setDraft:        (id: string, draft: PanelDraft) => void;
  /**
   * Add copies of a node, one per placement, each with the source's kind,
   * size and draft. For image variants: the source is the first variant and
   * these are the rest.
   */
  addVariants:     (sourceId: string, placements: VariantPlacement[]) => void;
}

let _nextId = 1;

type Persisted = { panels: PanelInstance[] };

let warned = false;
function warnOnce(message: string) {
  if (warned) return;
  warned = true;
  console.warn(`[nodePanel] ${message}`);
}

/**
 * localStorage that cannot take a user action down with it.
 *
 * zustand's persist middleware applies a change and then writes it out with
 * no error handling, so a write that throws escapes into whatever called the
 * store. Over quota is the usual way: a generated image is a data URL of a
 * megabyte or more, localStorage holds about five, and a batch of variants
 * blew straight past it -- the copies landed, then the throw aborted the
 * handler before their frame was made.
 *
 * So a failed write is retried without the images, which keeps every node's
 * position and inputs for the next load at the cost of its picture. Only if
 * that fails too is the save given up, with a warning; the board in memory is
 * untouched either way.
 */
export const panelStorage: PersistStorage<Persisted> = {
  getItem: (name) => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(name);
      return raw ? (JSON.parse(raw) as StorageValue<Persisted>) : null;
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(name, JSON.stringify(value));
      return;
    } catch {
      // Fall through to the lean save.
    }
    try {
      const lean: StorageValue<Persisted> = {
        ...value,
        state: { panels: value.state.panels.map(({ output: _image, ...rest }) => rest) },
      };
      window.localStorage.setItem(name, JSON.stringify(lean));
      warnOnce("Generated images are too large to keep across a reload; the nodes and their prompts are saved without them.");
    } catch {
      warnOnce("The board could not be saved to localStorage. It is unaffected until the page reloads.");
    }
  },
  removeItem: (name) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(name);
    } catch {
      // Nothing to recover.
    }
  },
};

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

  // everything → active, panels collapsed. selectedId names a single node,
  // so it is cleared rather than pointed at one of many.
  activateAll: () =>
    set((s) => ({
      selectedId: null,
      panels: s.panels.map((p) => ({ ...p, isActive: true, isPanelOpen: false })),
    })),

  // Leaves the other panels' selection alone, but collapses any open panel:
  // a settings panel belongs to a single selected node.
  togglePanel: (id) =>
    set((s) => ({
      selectedId: null,
      panels: s.panels.map((p) =>
        p.id === id
          ? { ...p, isActive: !p.isActive, isPanelOpen: false }
          : { ...p, isPanelOpen: false }
      ),
    })),

  // isActive, not selectedId, is the selection: after Ctrl+A every panel is
  // active while selectedId is null.
  removeActive: () =>
    set((s) => ({
      selectedId: null,
      panels: s.panels.filter((p) => !p.isActive),
    })),

  pastePanels: (sources, offset) => {
    const idMap: Record<string, string> = {};
    if (!sources.length) return idMap;
    const copies = sources.map((src): PanelInstance => {
      const id = `panel-${_nextId++}`;
      idMap[src.id] = id;
      return {
        id,
        kind: src.kind,
        canvasX: src.canvasX + offset,
        canvasY: src.canvasY + offset,
        w: src.w,
        h: src.h,
        output: src.output,
        draft: src.draft,
        label: src.label,
        // No job: the original's in-flight generation stays the original's.
        // Copying it would make both nodes poll the same job.
        isActive: true,
        isPanelOpen: false,
      };
    });
    set((s) => ({
      selectedId: copies.length === 1 ? copies[0].id : null,
      panels: [
        ...s.panels.map((p) => ({ ...p, isActive: false, isPanelOpen: false })),
        ...copies,
      ],
    }));
    return idMap;
  },

  setCanvasPos: (id, x, y) =>
    set((s) => ({
      panels: s.panels.map((p) => (p.id === id ? { ...p, canvasX: x, canvasY: y } : p)),
    })),

  selectPanel: (id) => set({ selectedId: id }),

  // Save current positions to the undo stack (call once per completed drag).
  replaceAll: (panels) =>
    set((s) => {
      const drafts = new Map(s.panels.map((p) => [p.id, p.draft]));
      return {
        panels: panels.map((p) =>
          drafts.has(p.id) ? { ...p, draft: drafts.get(p.id) } : p
        ),
      };
    }),

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

  setDraft: (id, draft) =>
    set((s) => ({
      panels: s.panels.map((p) => p.id === id ? { ...p, draft } : p),
    })),

  addVariants: (sourceId, placements) =>
    set((s) => {
      const source = s.panels.find((p) => p.id === sourceId);
      if (!source || !placements.length) return s;
      const copies: PanelInstance[] = placements.map((v) => ({
        id: `panel-${_nextId++}`,
        kind: source.kind,
        canvasX: v.canvasX,
        canvasY: v.canvasY,
        w: source.w,
        h: source.h,
        isActive: false,
        isPanelOpen: false,
        output: v.output,
        label: v.label,
        // Settings copied, not shared: editing one variant's settings must not
        // quietly change its siblings.
        draft: source.draft && {
          ...source.draft,
          settings: source.draft.settings && { ...source.draft.settings },
        },
      }));
      return { panels: [...s.panels, ...copies] };
    }),
    }),
    {
      name: "gcos-node-panels",
      storage: panelStorage,
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

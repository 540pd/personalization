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
// "compose" is the odd one out: the user writes its content rather than
// generating it (#181).
export type NodeKind = "image" | "video" | "instruction" | "compose";

// Every kind this build can show. A Record rather than a list so adding a
// NodeKind without adding it here is a type error. A saved node of any other
// kind -- from a newer branch, or a rolled-back release -- is set aside on
// load instead of crashing the board (#186).
const KNOWN_KINDS: Record<NodeKind, true> = {
  image: true,
  video: true,
  instruction: true,
  compose: true,
};

export function isKnownKind(kind: unknown): kind is NodeKind {
  return typeof kind === "string" && Object.prototype.hasOwnProperty.call(KNOWN_KINDS, kind);
}

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
  // True while `label` is one the app derived from the instruction. Such a
  // label follows the instruction: the next generate with a different prompt
  // re-derives it (#130). A rename by the user clears this and the name is
  // never changed for them again. Unset on nodes saved before the flag
  // existed, which therefore count as user-named -- the safe reading.
  labelAuto?: boolean;
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
  /**
   * Saved nodes of a kind this build does not know (#186). Never rendered and
   * never touched; only written back on save, so a build that knows the kind
   * shows them again. Their `kind` is not really a NodeKind.
   */
  parked:      PanelInstance[];
  selectedId:  string | null;
  /** `open` false lands the node selected but with no panel: a written kind has none. */
  addPanel:        (cx: number, cy: number, kind?: NodeKind, open?: boolean) => void;
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
  /**
   * Move several panels in one write. A Frame drag moves every panel in the
   * frame on each pointermove; one set per panel notified every subscriber,
   * and saved the board, once per panel per move (#155).
   */
  setCanvasPositions: (positions: Record<string, { x: number; y: number }>) => void;
  selectPanel:     (id: string | null) => void;
  /**
   * Replace every panel wholesale. Used by the shared undo timeline. A panel
   * that still exists keeps its current instruction and model: typing is not
   * an undo step, so undoing a move must not revert the instruction being
   * written. Its settings do come back from the snapshot -- a settings change
   * is a step, and may have resized the node (#129).
   *
   * `restoresDraft` names nodes whose whole draft is restored instead: for a
   * written kind (Compose) the text is the content, and closing its editor
   * is an undo step (#181).
   */
  replaceAll:      (panels: PanelInstance[], restoresDraft?: (p: PanelInstance) => boolean) => void;
  clearAll:        () => void;
  /**
   * Replace the board's panels with ones read from a file (#199): deselected,
   * closed, and with the id counter moved past them so the next new node
   * cannot take one of their ids.
   */
  loadPanels:      (panels: Omit<PanelInstance, "isActive" | "isPanelOpen">[]) => void;
  setSize:         (id: string, w: number, h: number) => void;
  setOutput:       (id: string, output: PanelOutput) => void;
  /** Record or clear an in-flight job. */
  setJob:          (id: string, job: string | undefined) => void;
  /** `auto` marks the label as derived by the app; a plain rename clears it. */
  setLabel:        (id: string, label: string, auto?: boolean) => void;
  setDraft:        (id: string, draft: PanelDraft) => void;
  /**
   * Add copies of a node, one per placement, each with the source's kind,
   * size and draft. For image variants: the source is the first variant and
   * these are the rest.
   */
  addVariants:     (sourceId: string, placements: VariantPlacement[]) => void;
}

let _nextId = 1;

/** Keep _nextId ahead of every `panel-N` id in `panels`, so new ids never collide. */
function bumpNextId(panels: { id: string }[]): void {
  const maxNum = panels.reduce((max, p) => {
    // String(p?.id): set-aside entries are unchecked saved data (#186).
    const n = Number(String(p?.id).replace("panel-", ""));
    return isNaN(n) ? max : Math.max(max, n);
  }, 0);
  if (maxNum >= _nextId) _nextId = maxNum + 1;
}

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

/** Quiet time before a save, in ms. Short enough that a reload rarely beats it. */
export const SAVE_DELAY_MS = 150;

/**
 * Saves the board once things settle, not on every change.
 *
 * persist writes on every set, and a write stringifies every panel -- image
 * data URLs and all, a megabyte or more each. A Frame drag sets positions on
 * every pointermove, so the board was serialised and written to localStorage
 * dozens of times a second, which is most of why a drag trailed the pointer
 * (#155). Only the latest value is kept; it is written once changes pause
 * for `delay`, or straight away when the page is hidden or unloaded, so a
 * reload or a closed tab still keeps the last move.
 */
export function deferredStorage<S>(inner: PersistStorage<S>, delay = SAVE_DELAY_MS): PersistStorage<S> {
  let pending: { name: string; value: StorageValue<S> } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!pending) return;
    const { name, value } = pending;
    pending = null;
    void inner.setItem(name, value);
  };

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
  }

  return {
    // A read must see the last write, even one still waiting.
    getItem: (name) => {
      flush();
      return inner.getItem(name);
    },
    setItem: (name, value) => {
      pending = { name, value };
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    removeItem: (name) => {
      if (pending?.name === name) pending = null;
      return inner.removeItem(name);
    },
  };
}

export const useNodePanel = create<NodePanelState>()(
  persist(
    (set, get) => ({
  panels:         [],
  parked:         [],
  selectedId:     null,

  // First creation: lands in panel-open state. All others go inactive.
  // The caller commits to the shared history afterwards, so creating a node
  // is itself undoable — it was not, before the two stacks merged.
  addPanel: (cx, cy, kind = "image", open = true) =>
    set((s) => {
      const newId = `panel-${_nextId++}`;
      const newPanels = [
        ...s.panels.map((p) => ({ ...p, isActive: false, isPanelOpen: false })),
        // Seeded from the same helper SinglePanel uses, so the node does not
        // flash at one size then resize on mount.
        { id: newId, kind, canvasX: cx, canvasY: cy, isActive: true, isPanelOpen: open,
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
        labelAuto: src.labelAuto,
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

  setCanvasPositions: (positions) =>
    set((s) => ({
      panels: s.panels.map((p) => {
        const at = positions[p.id];
        return at ? { ...p, canvasX: at.x, canvasY: at.y } : p;
      }),
    })),

  selectPanel: (id) => set({ selectedId: id }),

  // Save current positions to the undo stack (call once per completed drag).
  replaceAll: (panels, restoresDraft) =>
    set((s) => {
      const drafts = new Map(s.panels.map((p) => [p.id, p.draft]));
      return {
        panels: panels.map((p) => {
          if (!drafts.has(p.id) || restoresDraft?.(p)) return p;
          const current = drafts.get(p.id);
          // Settings are undo steps (they can resize the node), so they come
          // back with the snapshot along with the size they produced. The
          // instruction and model are typing, not steps, and stay as they are.
          return {
            ...p,
            draft: current ? { ...current, settings: p.draft?.settings } : p.draft,
          };
        }),
      };
    }),

  clearAll: () => set({ panels: [], selectedId: null }),

  loadPanels: (panels) => {
    bumpNextId(panels);
    set({
      selectedId: null,
      panels: panels.map((p) => ({ ...p, isActive: false, isPanelOpen: false })),
    });
  },

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

  setLabel: (id, label, auto = false) =>
    set((s) => ({
      panels: s.panels.map((p) => p.id === id ? { ...p, label, labelAuto: auto } : p),
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
        // A copy named from an auto-named source follows its own prompt too.
        labelAuto: source.labelAuto,
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
      storage: deferredStorage(panelStorage),
      // Only persist canvas data; UI-open flags and selectedId reset on load.
      // Set-aside nodes go back into the same list, so the saved shape is the
      // same for every build.
      partialize: (s) => ({ panels: [...s.panels, ...s.parked] }),
      // Split saved nodes into those this build can show and those it cannot.
      merge: (persisted, current) => {
        const saved = (persisted as Partial<Persisted> | undefined)?.panels;
        if (!Array.isArray(saved)) return current;
        const panels: PanelInstance[] = [];
        const parked: PanelInstance[] = [];
        for (const p of saved) (isKnownKind(p?.kind) ? panels : parked).push(p);
        if (parked.length) {
          const kinds = [...new Set(parked.map((p) => JSON.stringify(p?.kind)))].join(", ");
          console.warn(
            `[nodePanel] Set aside ${parked.length} saved node(s) of unknown kind ${kinds}: ` +
            "this build cannot show them. They are kept and reappear in a build that knows the kind."
          );
        }
        return { ...current, panels, parked };
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Reset interaction flags that shouldn't survive a reload.
        state.panels = state.panels.map((p) => ({
          ...p,
          isActive: false,
          isPanelOpen: false,
        }));
        // Keep _nextId ahead of all restored IDs to avoid collisions -- set-aside
        // ones too, or a new node could take the id of one that comes back later.
        bumpNextId([...state.panels, ...state.parked]);
      },
    }
  )
);

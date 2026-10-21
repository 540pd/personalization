import { create } from "zustand";
import { persist } from "zustand/middleware";
import * as bulk from "./nodePanel/bulk";
import * as content from "./nodePanel/content";
import * as geometry from "./nodePanel/geometry";
import { bumpNextId, nextPanelId } from "./nodePanel/ids";
import { persistOptions } from "./nodePanel/persistence";
import * as selection from "./nodePanel/selection";
import type { NodePanelState, PanelInstance } from "./nodePanel/types";

export type { NodeKind, PanelDraft, PanelInstance, PanelOutput, VariantPlacement } from "./nodePanel/types";
export { deferredStorage, panelStorage, SAVE_DELAY_MS } from "./nodePanel/persistence";

// The store is the wiring: each action is a pure transition from
// ./nodePanel, applied with `set`. A transition that changes nothing returns
// the panels it was given, and `withPanels` then hands zustand the old state
// so no subscriber is notified.
const withPanels = (s: NodePanelState, panels: PanelInstance[]) =>
  panels === s.panels ? s : { panels };

export const useNodePanel = create<NodePanelState>()(
  persist(
    (set, get) => ({
      panels:     [],
      selectedId: null,

      addPanel: (cx, cy, kind = "image", open = true) =>
        set((s) => selection.addPanel(s, nextPanelId(), cx, cy, kind, open)),
      removePanel:    (id) => set((s) => selection.removePanel(s, id)),
      activatePanel:  (id) => set((s) => selection.activatePanel(s, id)),
      raisePanel:     (id) => set((s) => withPanels(s, geometry.raisePanel(s.panels, id))),
      openPanel:      (id) => set((s) => selection.openPanel(s, id)),
      closePanel:     (id) => set((s) => ({ panels: selection.closePanel(s.panels, id) })),
      closeAllPanels: ()   => set(selection.closeAllPanels),
      activateAll:    ()   => set(selection.activateAll),
      togglePanel:    (id) => set((s) => selection.togglePanel(s, id)),
      removeActive:   ()   => set(selection.removeActive),

      pastePanels: (sources, offset) => {
        const { state, idMap } = bulk.pastePanels(get(), sources, offset, nextPanelId);
        if (state) set(state);
        return idMap;
      },

      setCanvasPos: (id, x, y) =>
        set((s) => ({ panels: geometry.setCanvasPos(s.panels, id, x, y) })),
      setCanvasPositions: (positions) =>
        set((s) => ({ panels: geometry.setCanvasPositions(s.panels, positions) })),

      selectPanel: (id) => set({ selectedId: id }),

      replaceAll: (panels, restoresDraft) =>
        set((s) => ({ panels: bulk.replaceAll(s.panels, panels, restoresDraft) })),

      clearAll: () => set({ panels: [], selectedId: null }),

      loadPanels: (panels) => {
        bumpNextId(panels);
        set({ selectedId: null, panels: selection.deactivated(panels) });
      },

      setSize:   (id, w, h)   => set((s) => withPanels(s, geometry.setSize(s.panels, id, w, h))),
      setOutput: (id, output) => set((s) => ({ panels: content.setOutput(s.panels, id, output) })),
      setJob:    (id, job)    => set((s) => ({ panels: content.setJob(s.panels, id, job) })),
      setLabel:  (id, label, auto = false) =>
        set((s) => ({ panels: content.setLabel(s.panels, id, label, auto) })),
      setDraft:  (id, draft)  => set((s) => ({ panels: content.setDraft(s.panels, id, draft) })),

      addVariants: (sourceId, placements) =>
        set((s) => withPanels(s, bulk.addVariants(s.panels, sourceId, placements, nextPanelId))),
    }),
    persistOptions,
  ),
);

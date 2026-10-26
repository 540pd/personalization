import { DEFAULT_ASPECT_RATIO, placeholderSize } from "@/constants/canvas.constants";
import type { NodeKind, PanelInstance, PanelsState } from "./types";

/** Every panel inactive and closed: placeholders stay on canvas. */
export function deactivated<P extends object>(panels: P[]): (P & { isActive: false; isPanelOpen: false })[] {
  return panels.map((p) => ({ ...p, isActive: false, isPanelOpen: false }));
}

// First creation: lands in panel-open state. All others go inactive.
// The caller commits to the shared history afterwards, so creating a node
// is itself undoable — it was not, before the two stacks merged.
export function addPanel(
  s: PanelsState, id: string, cx: number, cy: number, kind: NodeKind, open: boolean,
): PanelsState {
  return {
    selectedId: id,
    panels: [
      ...deactivated(s.panels),
      // Seeded from the same helper SinglePanel uses, so the node does not
      // flash at one size then resize on mount.
      { id, kind, canvasX: cx, canvasY: cy, isActive: true, isPanelOpen: open,
        ...placeholderSize(DEFAULT_ASPECT_RATIO) },
    ],
  };
}

export function removePanel(s: PanelsState, id: string): PanelsState {
  return {
    panels:     s.panels.filter((p) => p.id !== id),
    selectedId: s.selectedId === id ? null : s.selectedId,
  };
}

/** The only selected panel is `id`, with its panel open or not. */
function selectOnly(s: PanelsState, id: string, open: boolean): PanelsState {
  return {
    selectedId: id,
    panels: s.panels.map((p) =>
      p.id === id
        ? { ...p, isActive: true,  isPanelOpen: open  }
        : { ...p, isActive: false, isPanelOpen: false }
    ),
  };
}

// inactive → active: show transformer border, no panel.
export const activatePanel = (s: PanelsState, id: string) => selectOnly(s, id, false);

// active → panel-open: show panel alongside transformer.
export const openPanel = (s: PanelsState, id: string) => selectOnly(s, id, true);

// panel-open → active: collapse panel, transformer stays.
export function closePanel(panels: PanelInstance[], id: string): PanelInstance[] {
  return panels.map((p) => (p.id === id ? { ...p, isPanelOpen: false } : p));
}

// everything → inactive: placeholders stay on canvas.
export function closeAllPanels(s: PanelsState): PanelsState {
  return { selectedId: null, panels: deactivated(s.panels) };
}

// everything → active, panels collapsed. selectedId names a single node,
// so it is cleared rather than pointed at one of many.
export function activateAll(s: PanelsState): PanelsState {
  return {
    selectedId: null,
    panels: s.panels.map((p) => ({ ...p, isActive: true, isPanelOpen: false })),
  };
}

// Leaves the other panels' selection alone, but collapses any open panel:
// a settings panel belongs to a single selected node.
export function togglePanel(s: PanelsState, id: string): PanelsState {
  return {
    selectedId: null,
    panels: s.panels.map((p) =>
      p.id === id
        ? { ...p, isActive: !p.isActive, isPanelOpen: false }
        : { ...p, isPanelOpen: false }
    ),
  };
}

// isActive, not selectedId, is the selection: after Ctrl+A every panel is
// active while selectedId is null.
export function removeActive(s: PanelsState): PanelsState {
  return { selectedId: null, panels: s.panels.filter((p) => !p.isActive) };
}

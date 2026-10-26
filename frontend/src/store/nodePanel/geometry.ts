import { patchPanel } from "./content";
import type { PanelInstance } from "./types";

// Move a panel to the end of the array. Every placeholder renders at the
// same z-index, so array order IS paint order: last rendered wins. Called on
// drag rather than on click, matching Board.tsx's rule for Konva nodes --
// moving a node is a deliberate edit, merely clicking one should not reorder
// it. Position history is keyed by id, so reordering does not disturb undo.
//
// Returns `panels` itself when nothing moves, so the store can skip the write.
export function raisePanel(panels: PanelInstance[], id: string): PanelInstance[] {
  const i = panels.findIndex((p) => p.id === id);
  if (i === -1 || i === panels.length - 1) return panels;
  const next = panels.slice();
  next.push(next.splice(i, 1)[0]);
  return next;
}

export const setCanvasPos = (panels: PanelInstance[], id: string, x: number, y: number) =>
  patchPanel(panels, id, { canvasX: x, canvasY: y });

export function setCanvasPositions(
  panels: PanelInstance[], positions: Record<string, { x: number; y: number }>,
): PanelInstance[] {
  return panels.map((p) => {
    const at = positions[p.id];
    return at ? { ...p, canvasX: at.x, canvasY: at.y } : p;
  });
}

/** Returns `panels` itself when the size is unchanged, so the store can skip the write. */
export function setSize(panels: PanelInstance[], id: string, w: number, h: number): PanelInstance[] {
  const panel = panels.find((p) => p.id === id);
  if (!panel || (panel.w === w && panel.h === h)) return panels;
  return patchPanel(panels, id, { w, h });
}

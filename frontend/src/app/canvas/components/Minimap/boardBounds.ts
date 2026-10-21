import { boundsOf, type Bounds } from "@/lib/canvas/bounds";
import type { KonvaNodeRecord } from "@/store/konvaNodes.store";
import type { PanelInstance } from "@/store/nodePanel.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";

/**
 * Every node on the board as a box, regardless of which store holds it.
 *
 * Pure so the map can call it with hook values (it must re-render when they
 * change) while the keyboard handlers call it with getState() (they must read
 * the current value, not one captured when the effect was registered).
 *
 * boundsOf does the normalising: a Konva node's canvasY is its top edge, a
 * panel's is its vertical centre.
 */
export function boundsFrom(
  nodes: Record<string, KonvaNodeRecord>,
  panels: PanelInstance[]
): Bounds[] {
  return [...Object.values(nodes).map(boundsOf), ...panels.map(boundsOf)];
}

/** Current board contents, read imperatively. */
export function currentBounds(): Bounds[] {
  return boundsFrom(useKonvaNodes.getState().nodes, useNodePanel.getState().panels);
}

/**
 * Just the selected nodes.
 *
 * Selection lives in two places because the two node kinds are selected by
 * different machinery: Konva images through konvaSelection, panels through
 * their own isActive flag. Zoom-to-selection has to honour both or it would
 * silently ignore half the board.
 */
export function currentSelectionBounds(): Bounds[] {
  const ids = new Set(useKonvaSelection.getState().selectedIds);
  const nodes = Object.values(useKonvaNodes.getState().nodes).filter((n) => ids.has(n.id));
  const panels = useNodePanel.getState().panels.filter((p) => p.isActive);
  return boundsFrom(Object.fromEntries(nodes.map((n) => [n.id, n])), panels);
}

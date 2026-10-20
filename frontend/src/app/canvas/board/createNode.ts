// A node made from the dock's Create menu, placed at the viewport centre.

import { useNodePanel, type NodeKind } from "@/store/nodePanel.store";
import { useViewport } from "@/store/viewport.store";
import { useLayerOrder } from "@/store/layerOrder.store";
import { viewportCentre, type Point, type Rect, type Viewport } from "@/lib/canvas/coords";
import { canvasHistory } from "@/lib/canvas/history";
import { NODE_KINDS } from "../components/NodePanel/kinds";
import { canvasArea } from "../canvasArea";

/** How far each node already on the board pushes the next one down and right. */
export const CASCADE_STEP = 24;

/**
 * Where a new node of `width` goes: the centre of the visible canvas, nudged
 * by CASCADE_STEP per node already there so that repeated picks don't stack
 * exactly.
 */
export function spawnPoint(vp: Viewport, area: Rect, width: number, existing: number): Point {
  const offset = existing * CASCADE_STEP;
  const centre = viewportCentre(vp, area);
  // canvasX is the node's LEFT edge but canvasY is its vertical centre, so
  // only x needs the half-width shift. Centring it matches uploaded images
  // and keeps the Create Image panel on the node's preferred right side
  // instead of forcing it to flip. The width comes from the kind's own spec
  // -- an instruction node is not sized like an image one.
  return { x: centre.x - width / 2 + offset, y: centre.y + offset };
}

/**
 * Adds a node of `kind` at the viewport centre, as one undo step. Says
 * whether it did: a kind with no registered spec still no-ops rather than
 * creating a node the panel cannot render.
 */
export function createNodeAtViewportCentre(kind: NodeKind): boolean {
  const spec = NODE_KINDS[kind];
  if (!spec) return false;
  const { x, y, scale } = useViewport.getState();
  const { panels, addPanel } = useNodePanel.getState();
  const at = spawnPoint({ x, y, scale }, canvasArea(), spec.sizeFor(spec.defaultSettings).w, panels.length);
  // A written kind (Compose) has no panel to open.
  addPanel(at.x, at.y, kind, !spec.authored);
  // A new node must not land behind an uploaded image.
  useLayerOrder.getState().raiseDom();
  // Creating a node is an edit, so it belongs on the timeline. It was not
  // undoable before the merge.
  canvasHistory.commit();
  return true;
}

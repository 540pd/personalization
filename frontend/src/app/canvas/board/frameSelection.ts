// Create frame from a selection (#243): a Frame around two or more selected
// items, with nothing moved. Membership is by containment (frameMembers), so
// the new Frame owns them the moment it exists.
//
// And back (#244): Remove frame takes the Frame away, leaves its items where
// they are, and selects them.

import type Konva from "konva";
import { useFrames, type FrameRecord } from "@/store/frame.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { selectedPanels, useNodePanel } from "@/store/nodePanel.store";
import { boardStage } from "@/lib/canvas/boardStage";
import { boundsOf, containsBox, type Bounds } from "@/lib/canvas/bounds";
import { membersOf } from "./frameMembers";
import { canvasHistory } from "@/lib/canvas/history";
import { selectNodeIds, selectOnly } from "@/lib/canvas/selection";
import { takenLabels, uniqueLabel } from "@/lib/canvas/labels";
import {
  FRAME_LAYOUT_NAME_BAND, FRAME_LAYOUT_NAME_TOP, FRAME_LAYOUT_PADDING,
} from "@/constants/canvas.constants";

/** A selected item's box in canvas units, and whether a name sits above it. */
export interface SelectedBox extends Bounds {
  id: string;
  named: boolean;
}

/**
 * The Frame around `boxes`: FRAME_LAYOUT_PADDING on the sides and bottom.
 * Above each item, the padding -- or, for an item with a name, the name's
 * band with FRAME_LAYOUT_NAME_TOP over it (#235) -- so no name crosses the top.
 */
export function frameAround(boxes: readonly SelectedBox[], padding = FRAME_LAYOUT_PADDING): Bounds {
  const above = (b: SelectedBox) => (b.named ? FRAME_LAYOUT_NAME_TOP + FRAME_LAYOUT_NAME_BAND : padding);
  const left = Math.min(...boxes.map((b) => b.x)) - padding;
  const right = Math.max(...boxes.map((b) => b.x + b.w)) + padding;
  const top = Math.min(...boxes.map((b) => b.y - above(b)));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h)) + padding;
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * Whether these can be framed: two or more, no Frame among them, and not all
 * inside one Frame already -- Frames don't nest yet, so a Frame inside
 * another wouldn't move with it.
 */
export function canFrame(
  boxes: readonly SelectedBox[],
  frames: readonly FrameRecord[],
  framesSelected: number,
): boolean {
  if (boxes.length < 2 || framesSelected > 0) return false;
  return !frames.some((f) => boxes.every((b) => containsBox(boundsOf(f), b)));
}

/**
 * The selected shapes, text, images and generated nodes. A Konva node's box
 * is its client rect on the layer, so a rotated shape or a line's ends count
 * as drawn; without a stage (tests), its stored box.
 */
export function selectedBoxes(): SelectedBox[] {
  const nodes = useKonvaNodes.getState().nodes;
  const stage = boardStage.current;
  const konva = useKonvaSelection.getState().selectedIds.flatMap((id): SelectedBox[] => {
    const record = nodes[id];
    if (!record) return [];
    const node = stage?.findOne(`#${id}`) as Konva.Node | undefined;
    const layer = node?.getLayer();
    const r = node && layer ? node.getClientRect({ relativeTo: layer, skipShadow: true }) : null;
    const box = r ? { x: r.x, y: r.y, w: r.width, h: r.height } : boundsOf(record);
    return [{ id, ...box, named: !!record.label }];
  });
  const panels = selectedPanels(useNodePanel.getState())
    .map((p) => ({ id: p.id, ...boundsOf(p), named: !!p.label }));
  return [...konva, ...panels];
}

/** Whether the current selection can be framed. */
export function selectionFramable(): boolean {
  const { frames, selectedIds } = useFrames.getState();
  return canFrame(selectedBoxes(), Object.values(frames), selectedIds.length);
}

/**
 * Puts a Frame around the selection and selects it, in one undo step.
 * Returns its id, or null when the selection can't be framed.
 */
export function createFrameFromSelection(): string | null {
  if (!selectionFramable()) return null;
  const box = frameAround(selectedBoxes());
  const id = crypto.randomUUID();
  useFrames.getState().upsert({
    id,
    canvasX: box.x, canvasY: box.y, canvasW: box.w, canvasH: box.h,
    label: uniqueLabel("Frame", takenLabels()),
  });
  // The Frame alone is the selection, as after drawing one (#107).
  selectOnly("frame");
  useFrames.getState().select(id);
  canvasHistory.commit();
  return id;
}

/**
 * What a Frame holds: everything inside it, and with auto layout on, the
 * children it keeps by id (#225) that still exist.
 */
export function frameContents(frame: FrameRecord): { nodes: string[]; panels: string[] } {
  const m = membersOf(frame);
  const nodes = new Set(m.images.map((i) => i.id));
  const panels = new Set(m.panels.map((p) => p.id));
  const known = useKonvaNodes.getState().nodes;
  const panelIds = new Set(useNodePanel.getState().panels.map((p) => p.id));
  frame.layout?.columns.flat().forEach((id) => {
    if (known[id]) nodes.add(id);
    else if (panelIds.has(id)) panels.add(id);
  });
  return { nodes: [...nodes], panels: [...panels] };
}

/** The one selected Frame, when exactly one is selected and nothing else. */
export function removableFrame(): FrameRecord | null {
  const { frames, selectedIds } = useFrames.getState();
  if (selectedIds.length !== 1) return null;
  if (useKonvaSelection.getState().selectedIds.length) return null;
  if (useNodePanel.getState().selectedIds.length) return null;
  return frames[selectedIds[0]] ?? null;
}

/**
 * Removes the one selected Frame, in one undo step. Nothing moves; what was
 * in it is selected instead, and an empty Frame leaves nothing selected.
 * Returns whether a Frame went.
 */
export function removeSelectedFrame(): boolean {
  const frame = removableFrame();
  if (!frame) return false;
  // Read before the Frame goes: membership is by containment in it.
  const { nodes, panels } = frameContents(frame);
  useFrames.getState().remove(frame.id);
  selectOnly(null);
  selectNodeIds(nodes);
  const panelState = useNodePanel.getState();
  panels.forEach((id) => panelState.toggleSelected(id));
  canvasHistory.commit();
  return true;
}

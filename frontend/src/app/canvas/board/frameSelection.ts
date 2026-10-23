// Create frame from a selection (#243): a Frame around two or more selected
// items, with nothing moved. Membership is by containment (frameMembers), so
// the new Frame owns them the moment it exists.

import type Konva from "konva";
import { useFrames, type FrameRecord } from "@/store/frame.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { boardStage } from "@/lib/canvas/boardStage";
import { boundsOf, containsBox, type Bounds } from "@/lib/canvas/bounds";
import { canvasHistory } from "@/lib/canvas/history";
import { selectOnly } from "@/lib/canvas/selection";
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

const frameBounds = (f: FrameRecord): Bounds => ({ x: f.canvasX, y: f.canvasY, w: f.canvasW, h: f.canvasH });

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
  return !frames.some((f) => boxes.every((b) => containsBox(frameBounds(f), b)));
}

/**
 * The selected shapes, text, images and generated nodes. A Konva node's box
 * is its client rect on the layer, so a rotated shape or a line's ends count
 * as drawn; without a stage (tests), its stored box.
 */
export function selectedBoxes(): SelectedBox[] {
  const nodes = useKonvaNodes.getState().nodes;
  const stage = boardStage.current;
  const konva = useKonvaSelection.getState().nodeIds.flatMap((id): SelectedBox[] => {
    const record = nodes[id];
    if (!record) return [];
    const node = stage?.findOne(`#${id}`) as Konva.Node | undefined;
    const layer = node?.getLayer();
    const r = node && layer ? node.getClientRect({ relativeTo: layer, skipShadow: true }) : null;
    const box = r ? { x: r.x, y: r.y, w: r.width, h: r.height } : boundsOf(record);
    return [{ id, ...box, named: !!record.label }];
  });
  const panels = useNodePanel
    .getState()
    .panels.filter((p) => p.isActive)
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

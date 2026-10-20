// What a frame carries when it moves.
//
// Frames have no persistent parent/child link: membership is decided at the
// moment the drag starts, by containment. That keeps "what moves with this
// frame" answerable from geometry alone, with nothing to keep in sync when a
// node is dragged in or out.
//
// Uploaded images are Konva nodes on Board's stage and panels are DOM, so the
// two move through different doors -- hence boardStage as well as the stores.

import type Konva from "konva";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useNodePanel } from "@/store/nodePanel.store";
import type { FrameRecord } from "@/store/frame.store";
import { boardStage } from "@/lib/canvas/boardStage";
import { boundsOf, containsBox } from "@/lib/canvas/bounds";
import { syncNodeGeometry } from "./geometry";

export interface Member {
  id: string;
  /** Position when the drag began, so every move is an absolute offset. */
  startX: number;
  startY: number;
}

export interface FrameMembers {
  images: Member[];
  panels: Member[];
}

/** Everything fully inside `frame` right now. */
export function membersOf(frame: FrameRecord): FrameMembers {
  const outer = boundsOf(frame);

  const images = Object.values(useKonvaNodes.getState().nodes)
    .filter((n) => containsBox(outer, boundsOf(n)))
    .map((n): Member => ({ id: n.id, startX: n.canvasX, startY: n.canvasY }));

  const panels = useNodePanel.getState().panels
    .filter((p) => containsBox(outer, boundsOf(p)))
    .map((p): Member => ({ id: p.id, startX: p.canvasX, startY: p.canvasY }));

  return { images, panels };
}

/**
 * Offset every member from where it was when the drag began.
 *
 * Absolute from the start position rather than incremental, so a dropped
 * pointermove cannot leave a node lagging behind the frame.
 */
export function moveMembers(members: FrameMembers, dx: number, dy: number): void {
  const stage = boardStage.current;
  const nodes = useKonvaNodes.getState();

  members.images.forEach((m) => {
    const x = m.startX + dx;
    const y = m.startY + dy;
    // The Konva node is the source of truth for where an image is drawn;
    // konvaNodes mirrors it for ports, wires and labels.
    const node = stage?.findOne<Konva.Shape>(`#${m.id}`);
    if (node) {
      node.position({ x, y });
      // Through syncNodeGeometry rather than x/y alone, so a line's `ends`
      // move with it and its end handles stay on the line.
      syncNodeGeometry(node);
      return;
    }
    const rec = nodes.nodes[m.id];
    if (rec) nodes.upsert({ ...rec, canvasX: x, canvasY: y });
  });

  // One write for every panel, not one each (#155).
  if (members.panels.length) {
    useNodePanel.getState().setCanvasPositions(
      Object.fromEntries(members.panels.map((m) => [m.id, { x: m.startX + dx, y: m.startY + dy }]))
    );
  }

  stage?.batchDraw();
}

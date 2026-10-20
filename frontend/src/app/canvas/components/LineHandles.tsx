"use client";

// The handles of a selected line or arrow: one at each end, and one in the
// middle that bends it.
//
// A line has no useful resize box: the transformer's corner anchors would
// stretch the box the line sits in, not move either of its ends. So a lone
// selected line hides the transformer (selectionChrome) and gets these
// instead, the way Figma and Luma edit a line.
//
// DOM rather than Konva, like the ports: they keep a constant on-screen size
// at every zoom for free, and track the viewport store without the canvas
// having to redraw chrome on every zoom step.

import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useViewport } from "@/store/viewport.store";
import { useToolStore } from "@/store/tool.store";
import { boardStage } from "@/lib/canvas/boardStage";
import { toCanvas, toScreen, type Point } from "@/lib/canvas/coords";
import { canvasHistory } from "@/lib/canvas/history";
import { announceGesture } from "@/lib/canvas/gesture";
import { bendToward, curveMid, lineAttrs, snap45, type BoardShape } from "../board/shapes";
import { syncNodeGeometry } from "../board/geometry";
import { COLORS, LINE_STRAIGHT_SNAP, SELECTION, Z_INDEX } from "@/constants/canvas.constants";
import { trackPointer } from "@/lib/dom/pointer";

const END_HANDLE_SIZE = 10; // screen px
// Smaller, so it reads as a different kind of control from the ends.
const BEND_HANDLE_SIZE = 8; // screen px

type Ends = { a: Point; b: Point; bend: number };
type Grip = "a" | "b" | "bend";

/** Where the line's attrs go for a pointer at `p`, holding Shift or not. */
function attrsFor(grip: Grip, ends: Ends, p: Point, shift: boolean) {
  const { a, b, bend } = ends;
  switch (grip) {
    // Shift swings the moving end to 45-degree steps round the pinned one.
    // The bend rides along unchanged, so the curve keeps its bulge.
    case "a": return lineAttrs(shift ? snap45(b, p) : p, b, bend);
    case "b": return lineAttrs(a, shift ? snap45(a, p) : p, bend);
    case "bend": {
      const next = bendToward(a, b, p);
      const { scale } = useViewport.getState();
      // Back within a few screen px of straight is straight.
      return lineAttrs(a, b, Math.abs(next) * scale < LINE_STRAIGHT_SNAP ? 0 : next);
    }
  }
}

/** Puts new attrs on the line and republishes it, so the handles follow. */
function apply(node: BoardShape, attrs: ReturnType<typeof lineAttrs>) {
  node.setAttrs(attrs);
  syncNodeGeometry(node);
  node.getLayer()?.batchDraw();
}

/**
 * Follows one grip from press to release. Everything else about the line is
 * as it was when the press began. Commits one undo step, and only if the
 * pointer actually moved -- the presses of a double-click must not leave
 * empty steps behind.
 */
function dragGrip(e: React.PointerEvent, id: string, grip: Grip, ends: Ends) {
  e.stopPropagation();
  e.preventDefault();
  const node = boardStage.current?.findOne<BoardShape>(`#${id}`);
  if (!node) return;
  let moved = false;

  const move = (ev: PointerEvent) => {
    if (!moved) announceGesture(true);
    moved = true;
    const p = toCanvas({ x: ev.clientX, y: ev.clientY }, useViewport.getState());
    apply(node, attrsFor(grip, ends, p, ev.shiftKey));
  };
  // A cancelled drag ends where it is, as a release would.
  const end = () => {
    if (!moved) return;
    announceGesture(false);
    canvasHistory.commit();
  };
  trackPointer({ onMove: move, onUp: end, onCancel: end });
}

/** Double-clicking the middle handle straightens the line. */
function straighten(id: string, ends: Ends) {
  const node = boardStage.current?.findOne<BoardShape>(`#${id}`);
  if (!node || !ends.bend) return;
  apply(node, lineAttrs(ends.a, ends.b, 0));
  canvasHistory.commit();
}

function handleStyle(pt: Point, size: number): React.CSSProperties {
  return {
    position: "fixed",
    left: pt.x - size / 2,
    top: pt.y - size / 2,
    width: size,
    height: size,
    borderRadius: "50%",
    background: COLORS.paper,
    border: `${SELECTION.borderWidth}px solid ${COLORS.ink}`,
    boxSizing: "border-box",
    cursor: "move",
    zIndex: Z_INDEX.ports,
    touchAction: "none",
  };
}

export default function LineHandles() {
  const ids = useKonvaSelection((s) => s.nodeIds);
  const nodes = useKonvaNodes((s) => s.nodes);
  const pointer = useToolStore((s) => s.activeTool === "pointer");
  const { x, y, scale } = useViewport();

  if (!pointer || ids.length !== 1) return null;
  const id = ids[0];
  const ends = nodes[id]?.ends;
  if (!ends) return null;
  const vp = { x, y, scale };

  return (
    <>
      {(["a", "b"] as const).map((end) => (
        <div
          key={end}
          data-testid={`line-handle-${end}`}
          onPointerDown={(e) => dragGrip(e, id, end, ends)}
          style={handleStyle(toScreen(ends[end], vp), END_HANDLE_SIZE)}
        />
      ))}
      <div
        data-testid="line-handle-bend"
        title="Drag to bend, double-click to straighten"
        onPointerDown={(e) => dragGrip(e, id, "bend", ends)}
        onDoubleClick={() => straighten(id, ends)}
        style={handleStyle(toScreen(curveMid(ends.a, ends.b, ends.bend), vp), BEND_HANDLE_SIZE)}
      />
    </>
  );
}

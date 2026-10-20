import { useRef, useState } from "react";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { useViewport } from "@/store/viewport.store";
import { useLayerOrder } from "@/store/layerOrder.store";
import { selectOnly } from "@/lib/canvas/selection";
import { canvasHistory } from "@/lib/canvas/history";
import { toCanvas } from "@/lib/canvas/coords";
import { boundsOf } from "@/lib/canvas/bounds";
import { dragFrameFrom, selectedFrameAround } from "../../../board/frameDrag";
import { dropIntoLayout, trackLayoutDrag } from "../../../board/autoLayoutDrop";

/** Where a pointer event is on the board, in canvas units. */
const pointerOnCanvas = (e: React.PointerEvent) => {
  const { x, y, scale } = useViewport.getState();
  return toCanvas({ x: e.clientX, y: e.clientY }, { x, y, scale });
};

export interface PanelDragOptions {
  instance: PanelInstance;
  scale: number;
  /** An authored kind has no panel, so a click only selects it. */
  authored: boolean;
  onActivate:     () => void; // inactive → active
  onOpenPanel:    () => void; // active → panel-open
  onClosePanel:   () => void; // panel-open → active
  onSetCanvasPos: (x: number, y: number) => void;
}

/**
 * Moving a node by its placeholder, and the click that selects it.
 * Returns the placeholder's pointer handlers and whether a drag is under way.
 */
export function usePanelDrag({
  instance, scale, authored, onActivate, onOpenPanel, onClosePanel, onSetCanvasPos,
}: PanelDragOptions) {
  const { canvasX, canvasY, isActive, isPanelOpen } = instance;
  const [dragging, setDragging] = useState(false);
  const isDragging = useRef(false);
  /** True only between a pointerdown on THIS node and its pointerup. */
  const pointerDownHere = useRef(false);
  const dragStart  = useRef({ px: 0, py: 0, cx: 0, cy: 0 });

  // A selected or dragged node comes to the front (#106), so its whole
  // content and its handles show over whatever it overlaps. raisePanel only
  // reorders within the DOM layer; bringing that layer forward is what lifts
  // a Create node back over an uploaded image after the image was last moved.
  const bringToFront = () => {
    useNodePanel.getState().raisePanel(instance.id);
    useLayerOrder.getState().raiseDom();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    isDragging.current = false;
    // Records that the gesture began HERE. Without it, onPointerMove fires
    // for any pointer that merely passes over this node with a button held
    // -- dragging an uploaded image across it moved the node too, as if the
    // two were glued.
    pointerDownHere.current = true;
    dragStart.current = { px: e.clientX, py: e.clientY, cx: canvasX, cy: canvasY };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    // A held button is not enough: the press has to have started on this
    // node. Otherwise a drag belonging to something else -- an uploaded
    // image passing over -- is read as a drag of this one, using whatever
    // stale dragStart was left from last time.
    if (!pointerDownHere.current || e.buttons === 0 || isPanelOpen) return;
    const dx = e.clientX - dragStart.current.px;
    const dy = e.clientY - dragStart.current.py;
    if (Math.hypot(dx, dy) > 4) {
      // A selected frame owns a drag that starts inside it (#119). Handed over
      // here, past the threshold, so a plain click still selects this node.
      // An active node is the selection itself and drags on its own.
      if (!isDragging.current && !isActive) {
        const frame = selectedFrameAround(boundsOf(instance), instance.id);
        if (frame) {
          // The frame follows the pointer from here on; this node's own
          // move and up handlers stand down.
          pointerDownHere.current = false;
          dragFrameFrom(frame, { x: dragStart.current.px, y: dragStart.current.py });
          return;
        }
      }
      if (!isDragging.current) {
        isDragging.current = true;
        setDragging(true);
        // A press-drag never reaches onPointerUp's selection branch, so
        // without this the dragged node is not selected and the previously
        // selected one never lets go — two nodes selected at once, with the
        // keyboard handlers aimed at the wrong one. Same hole #24 fixed for
        // uploaded images. activatePanel clears every other panel.
        if (!isActive) {
          onActivate();
          selectOnly("panel");
        }
        // Outside the isActive guard: an already-selected node still has to
        // come forward, or dragging it across a newer one buries it.
        bringToFront();
      }
      onSetCanvasPos(dragStart.current.cx + dx / scale, dragStart.current.cy + dy / scale);
      // Over an auto layout row: show where it would land (#228).
      trackLayoutDrag(instance.id, pointerOnCanvas(e));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    // Nothing to finish if the gesture never began here.
    if (!pointerDownHere.current) return;
    pointerDownHere.current = false;
    if (!isDragging.current) {
      // Shift/Ctrl/Cmd+click: add to or drop from the selection, the same
      // modifiers uploaded images and wires accept.
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        // Added to the selection, it comes forward; dropped from it, it stays.
        if (!isActive) bringToFront();
        useNodePanel.getState().togglePanel(instance.id);
      } else {
        // Normal click: clear other selection types.
        selectOnly("panel");
        bringToFront();
        // Step through states: inactive → active → panel-open → active.
        // An authored kind has no panel, so a click only selects it.
        if (!isActive)              onActivate();
        else if (authored)          { /* already selected */ }
        else if (!isPanelOpen)      onOpenPanel();
        else                        onClosePanel();
      }
    } else {
      // Into, within or out of an auto layout row, before the commit so the
      // drop and the new order are one undo step (#228).
      dropIntoLayout(instance.id, pointerOnCanvas(e));
      // Completed a real drag — save position so Ctrl+Z can undo it.
      canvasHistory.commit();
    }
    isDragging.current = false;
    setDragging(false);
  };

  const onPointerCancel = () => {
    pointerDownHere.current = false;
    isDragging.current = false;
    setDragging(false);
  };

  return { dragging, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } };
}

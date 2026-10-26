// Board's stage pointer events: click to select, wheel zoom, node drags
// (and their hand-off to a selected Frame), resize, hover and cursor.

import type Konva from "konva";
import { useViewport } from "@/store/viewport.store";
import { useToolStore, panningTool, cursorFor } from "@/store/tool.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useConnectionStore } from "@/store/connection.store";
import { selectOnly } from "@/lib/canvas/selection";
import { boundsOf } from "@/lib/canvas/bounds";
import { disposeAll } from "@/lib/dom/listen";
import { dragFrameFrom, selectedFrameAround } from "./frameDrag";
import { clearLayoutDrag, dropIntoLayout, trackLayoutDrag } from "./autoLayoutDrop";
import { bakeScale, isBoardShape } from "./shapes";
import { bakeTextResize, isBoardText } from "./text";
import { syncNodeGeometry } from "./geometry";
import type { BoardContext } from "./boardContext";

export interface StageEventDeps {
  /** Space is held: the stage pans whatever the tool. */
  spacePan: { readonly current: boolean };
  /** True once for the click that follows a release ending a draw. */
  consumeEndedDraw: () => boolean;
}

/** A Konva listener, and what removes it. */
function on<E extends Event>(
  node: Konva.Node,
  type: string,
  handler: (e: Konva.KonvaEventObject<E>) => void,
): () => void {
  node.on(type, handler);
  return () => node.off(type, handler);
}

const isSelectable = (stage: Konva.Stage, t: Konva.Node) => t !== stage && t.hasName("selectable");

export function bindStageEvents(board: BoardContext, deps: StageEventDeps): () => void {
  const { stage, layer, transformer, hover, bringToFront, updateSelectionChrome, saveSnapshot } = board;
  const cursor = (c: string) => { stage.container().style.cursor = c; };

  // Click to select / deselect.
  const onClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (deps.consumeEndedDraw()) return;
    // Clicking a selectable node always selects it — auto-switch to pointer
    // if the user is in another tool mode (matches Figma / Luma behaviour).
    if (isSelectable(stage, e.target)) {
      if (useToolStore.getState().activeTool !== "pointer") {
        useToolStore.getState().setTool("pointer");
      }
      const n  = e.target as Konva.Shape;
      const id = n.id() || String(n._id);
      // Shift is the additive modifier in Figma/Illustrator/Sketch, so accept
      // it alongside Ctrl/Cmd — it is the one most people reach for first.
      const isMulti = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey;

      if (isMulti) {
        // Ctrl+click: toggle this node in/out of the selection.
        const current = transformer.nodes() as Konva.Shape[];
        const alreadyIn = current.includes(n);
        if (alreadyIn) {
          transformer.nodes(current.filter((node) => node !== n));
          useKonvaSelection.getState().removeFromSelection(id);
        } else {
          transformer.nodes([...current, n]);
          hover.hide();
          useKonvaSelection.getState().addToSelection(id);
          bringToFront(n);
        }
        updateSelectionChrome();
      } else {
        // Normal click: single-select, clear everything else. This used to
        // clear panels and wires by hand and miss frames entirely, which is
        // how a frame could keep its handles while a node was selected.
        selectOnly("node");
        transformer.nodes([n]);
        bringToFront(n);
        // The transformer is created before any shape exists, so it would
        // otherwise sit at the bottom of the layer and its border and handles
        // would be hidden behind whatever overlaps the selected node.
        updateSelectionChrome();
        hover.hide(); // transformer border takes over from here
        useKonvaSelection.getState().select(id);
      }
      layer.batchDraw();
      return;
    }

    // Nothing under the cursor, so nothing stays selected -- panels, nodes,
    // wires and frames alike, regardless of active tool.
    selectOnly(null);
    // Same rule as clicking a node and as Ctrl+A: a click on the board
    // returns to pointer. This used to bail out here instead, which left
    // the dock lit for a tool the next click was still going to use, with
    // nothing on screen explaining why. Because the tool is now always
    // pointer by this line, the clear below is unconditional.
    if (useToolStore.getState().activeTool !== "pointer") {
      useToolStore.getState().setTool("pointer");
    }
    transformer.nodes([]);
    updateSelectionChrome();
    layer.batchDraw();
  };

  // Wheel → zoom toward cursor.
  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    useViewport.getState().zoomToPoint(e.evt.deltaY, pointer.x, pointer.y);
  };

  // Where the current press began, in screen px. A drag handed to a frame
  // (#119) measures from here rather than from where Konva noticed it, or
  // the frame would trail the pointer by the drag threshold.
  let pressAt = { x: 0, y: 0 };
  const onPress = (e: Konva.KonvaEventObject<PointerEvent>) => {
    pressAt = { x: e.evt.clientX, y: e.evt.clientY };
  };
  // The node whose drag went to its frame instead. Konva still fires
  // dragend for it on stopDrag, which must not commit an empty undo step.
  let handedOff: Konva.Node | null = null;

  // Drag begins: show the move cursor. Konva fires this only after the drag
  // threshold is passed, so a plain click never flashes it.
  const onDragStart = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (!isSelectable(stage, e.target)) return;
    const n = e.target as Konva.Shape;
    // A selected frame owns a drag that starts inside it (#119): the
    // selection says the frame is what is being worked on. The node
    // itself is still reached by a plain click -- this only runs once
    // Konva's drag threshold is passed.
    if (!transformer.nodes().includes(n)) {
      const rec = useKonvaNodes.getState().nodes[n.id()];
      const frame = rec ? selectedFrameAround(boundsOf(rec), n.id()) : null;
      if (rec && frame) {
        handedOff = n;
        n.stopDrag();
        n.position({ x: rec.canvasX, y: rec.canvasY });
        // The hover outline was drawn round the image where it stood. The
        // frame drag moves the image but not the outline, which stayed
        // behind as a detached border (#131). The selection border is
        // already the frame's.
        hover.hide();
        dragFrameFrom(frame, pressAt);
        return;
      }
    }
    cursor("move");
    // Konva suppresses "click" once a drag begins, so a press-drag on an
    // unselected node never reaches the click handler's selection logic.
    // Leaving the old selection in place would point Delete and Ctrl+C at
    // a node the user is not touching. Already-selected nodes are left
    // alone so dragging one of a multi-selection keeps the group.
    if (!transformer.nodes().includes(n)) {
      transformer.nodes([n]);
      useKonvaSelection.getState().select(n.id() || String(n._id));
      useNodePanel.getState().closeAllPanels();
      useConnectionStore.getState().clearSelection();
      hover.hide(); // transformer border replaces the hover outline
    }
    // Raise the dragged node so it cannot vanish under something it is
    // being moved across. Selecting already raised it (#106); a drag of a
    // node that was already selected raises it again, in case something
    // newer has landed on top since.
    bringToFront(n);
    updateSelectionChrome();
    layer.batchDraw();
  };

  // While dragging: sync viewport store so the NodePanel tracks in real-time.
  const onDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target === stage) {
      // Keep viewport store live during pan so HTML overlays move with canvas.
      useViewport.getState().setPosition(stage.x(), stage.y());
      return;
    }
    // Konva node drag: keep the hover outline and port overlay in sync.
    if (e.target.hasName("selectable")) {
      hover.show(e.target as Konva.Shape);
      syncNodeGeometry(e.target as Konva.Shape);
      updateSelectionChrome(); // outlines follow the moving node
      // One item over an auto layout row: show where it would land (#228).
      // Several move as before.
      const pt = stage.getRelativePointerPosition();
      if (pt && transformer.nodes().length <= 1) trackLayoutDrag(e.target.id(), pt);
    }
  };

  // Drag end → persist pan position; save snapshot on node drag.
  const onDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target === stage) {
      useViewport.getState().setPosition(stage.x(), stage.y());
    } else if (e.target === handedOff) {
      // Its frame is moving it; the frame commits the step when it lands.
      handedOff = null;
    } else if (e.target.hasName("selectable")) {
      cursor("default");
      syncNodeGeometry(e.target as Konva.Shape);
      // Into, within or out of an auto layout row, before the commit so the
      // drop and the new order are one undo step (#228).
      const pt = stage.getRelativePointerPosition();
      if (pt && transformer.nodes().length <= 1) dropIntoLayout(e.target.id(), pt);
      else clearLayoutDrag();
      saveSnapshot();
    }
  };

  // Keep port overlays in sync during transformer resize. Every selected node
  // moves under a multi-select resize, so sync all of them, not just the first.
  const onTransform = () => {
    (transformer.nodes() as Konva.Shape[]).forEach((n) => {
      if (isBoardShape(n)) bakeScale(n);
      if (isBoardText(n)) bakeTextResize(n, transformer.getActiveAnchor());
      syncNodeGeometry(n);
    });
    updateSelectionChrome();
  };

  // Save snapshot after transformer resize / rotate commit.
  const onTransformEnd = () => {
    saveSnapshot();
    (transformer.nodes() as Konva.Shape[]).forEach(syncNodeGeometry);
  };

  // Cursor: move over selectable nodes in pointer mode.
  const onOver = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (useToolStore.getState().activeTool !== "pointer") return;
    if (isSelectable(stage, e.target)) {
      // Outline is the hover affordance; the move cursor is reserved for an
      // actual drag so it never claims "moving" while the node is at rest.
      hover.show(e.target as Konva.Shape);
    }
  };
  const onOut = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isSelectable(stage, e.target)) {
      cursor("default");
      hover.hide();
    }
  };

  // Cursor: grabbing while panning (regular pan mode or space-pan).
  //
  // "not pointer" used to be enough to mean "this tool pans", because every
  // non-pointer tool did. Frame is the first that draws instead, so it must
  // not advertise a pan it will never perform.
  const onDown = () => {
    if (deps.spacePan.current || panningTool(useToolStore.getState().activeTool)) {
      cursor("grabbing");
    }
  };
  const onUp = () => {
    // Only keep grab after releasing the mouse if spacebar is still held.
    if (deps.spacePan.current) {
      cursor("grab");
    } else {
      // Back to the armed tool's own cursor, not a blanket default: a
      // misclick while Frame is armed used to leave it without a crosshair.
      cursor(cursorFor(useToolStore.getState().activeTool));
    }
  };

  const off = [
    on(stage, "click tap", onClick),
    on(stage, "wheel", onWheel),
    on(stage, "pointerdown.press", onPress),
    on(stage, "dragstart", onDragStart),
    on(stage, "dragmove", onDragMove),
    on(stage, "dragend", onDragEnd),
    on(transformer, "transform", onTransform),
    on(transformer, "transformend", onTransformEnd),
    on(stage, "mouseover", onOver),
    on(stage, "mouseout", onOut),
    on(stage, "mousedown", onDown),
    on(stage, "mouseup", onUp),
  ];
  return () => disposeAll(off);
}

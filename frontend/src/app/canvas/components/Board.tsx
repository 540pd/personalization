"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Konva from "konva";
import { useViewport } from "@/store/viewport.store";
import { useToolStore, panningTool, cursorFor, drawingTool } from "@/store/tool.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useConnectionStore } from "@/store/connection.store";
import { createUploadHandler } from "../board/upload";
import { restoreFrameImages, saveFrameImagePositions } from "../board/frameImageStorage";
import { dragFrameFrom, selectedFrameAround } from "../board/frameDrag";
import { clearLayoutDrag, dropIntoLayout, trackLayoutDrag } from "../board/autoLayoutDrop";
import { boundsOf } from "@/lib/canvas/bounds";
import { createDragDropHandlers } from "../board/dragDrop";
import { canvasArea, useCanvasArea } from "../canvasArea";
import { createFrameHandlers } from "../board/frame";
import { createShapeDrawHandlers } from "../board/shapeDraw";
import { bakeScale, isBoardShape } from "../board/shapes";
import { createTextTool } from "../board/textTool";
import { bakeTextResize, isBoardText } from "../board/text";
import { applyColor } from "../board/recolor";
import { COLOR_EVENT, type ColorDetail } from "../board/palette";
import { useFrames } from "@/store/frame.store";
import { selectOnly, registerNodeChromeClear } from "@/lib/canvas/selection";
import { frameStage } from "@/lib/canvas/frameStage";
import { boardStage } from "@/lib/canvas/boardStage";
import { bindWheelZoom } from "@/lib/canvas/wheelZoom";
import { applyDraggability } from "../board/draggability";
import { createEditKeysHandler, createNode, deleteNodes, selectNodes } from "../board/clipboard";
import { CLEAR_EVENT } from "../board/clearBoard";
import { LOAD_EVENT, type BoardFile } from "../board/boardFile";
import { readSavedCanvas, startCanvasPersistence } from "../board/canvasPersistence";
import { imageHitFunc } from "../board/upload";
import { createHoverOutline, type HoverOutline } from "../board/hoverOutline";
import { updateSelectionChrome as applySelectionChrome } from "../board/selectionChrome";
import { syncNodeGeometry, syncAllNodeGeometry as syncAllGeometry } from "../board/geometry";
import { canvasHistory } from "@/lib/canvas/history";
import { useLayerOrder } from "@/store/layerOrder.store";
import { boardIsShown } from "@/store/section.store";
import { COLORS, Z_INDEX, MIN_NODE_SIZE, SHAPE_MIN_SIZE, SELECTION } from "@/constants/canvas.constants";

// imageUrl and label live in konvaNodes, not on the shape, and Delete drops
// that record -- so they ride along, or an undone delete would bring back an
// image with no name and nothing to send as a generation reference.
type Snapshot = Array<{
  node: Konva.Shape;
  attrs: Record<string, unknown>;
  imageUrl?: string;
  label?: string;
}>;

/** A canvas area no point is inside, for while another page covers the board. */
const NO_AREA = { left: 0, top: 0, width: -1, height: -1 };

export default function Board() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const layerRef = useRef<Konva.Layer | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const hoverRef = useRef<HoverOutline | null>(null);
  const isSpacePanning = useRef(false);
  // Drives the drop affordance. State rather than a ref: it has to paint.
  const [dropActive, setDropActive] = useState(false);

  // Bound to the refs here so the effects below can call it with no
  // arguments; the drawing itself lives in board/selectionChrome.
  const updateSelectionChrome = useCallback(() => {
    const layer = layerRef.current;
    const transformer = transformerRef.current;
    if (!layer || !transformer) return;
    applySelectionChrome(layer, transformer);
  }, []);

  const { x, y, scale } = useViewport();
  const { activeTool } = useToolStore();
  // Geometry for the drop affordance; tracks the sidebar collapse and resizes.
  const dropArea = useCanvasArea();
  const topLayer = useLayerOrder((s) => s.topLayer);

  // Mount Konva stage once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const stage = new Konva.Stage({
      container,
      width: container.offsetWidth,
      height: container.offsetHeight,
      draggable: false,
    });

    boardStage.current = stage;
    const layer = new Konva.Layer();
    stage.add(layer);

    const transformer = new Konva.Transformer({
      rotateEnabled: false,
      // Konva implements a flip as rotation:-180, and every geometry helper
      // here computes x + width * scaleX with no notion of rotation — a
      // flipped node would report a box the shape no longer occupies, leaving
      // its port and wires stranded a full width away.
      flipEnabled: false,
      enabledAnchors: ["top-left", "top-right", "bottom-left", "bottom-right"],
      borderStroke: COLORS.ink,
      borderStrokeWidth: SELECTION.borderWidth,
      anchorStroke: COLORS.ink,
      anchorFill: COLORS.paper,
      anchorSize: SELECTION.anchorSize,
      anchorCornerRadius: SELECTION.anchorCornerRadius,
      padding: SELECTION.padding,
      // Without a floor, an over-drag collapses the node to ~0 and it becomes
      // impossible to grab again. Boxes arrive in absolute (post-zoom) coords,
      // so divide by the stage scale to keep the floor zoom-independent.
      boundBoxFunc: (oldBox, newBox) => {
        const s = stage.scaleX() || 1;
        const min = minResizeEdge();
        if (newBox.width / s < min || newBox.height / s < min) return oldBox;
        return newBox;
      },
    });
    layer.add(transformer);
    // A shape may go far smaller than an image: it is often a small marker,
    // and it has no picture to keep recognisable.
    function minResizeEdge() {
      // Text too: a line of it is far shorter than MIN_NODE_SIZE, and would
      // otherwise refuse every resize from the start.
      return transformer.nodes().every((n) => isBoardShape(n) || isBoardText(n))
        ? SHAPE_MIN_SIZE
        : MIN_NODE_SIZE;
    }

    const hover = createHoverOutline(layer, transformer);
    const showHover = hover.show;
    const hideHover = hover.hide;

    stageRef.current = stage;
    layerRef.current = layer;
    transformerRef.current = transformer;
    hoverRef.current = hover;
    window.dispatchEvent(new Event("canvas:board-ready"));

    const syncAllNodeGeometry = () => syncAllGeometry(layer);
    // A selected or dragged node comes to the front (#106), so its whole
    // content and its handles show over whatever it overlaps. moveToTop only
    // reorders within the canvas; bringing the canvas itself forward is what
    // lifts an image over a Create node, which is DOM and otherwise always
    // painted above it. Geometry is re-synced because ports, labels and the
    // occlusion tests read each node's z from it.
    const bringToFront = (n: Konva.Node) => {
      n.moveToTop();
      useLayerOrder.getState().raiseCanvas();
      syncAllNodeGeometry();
    };

    // --- Undo / redo ---------------------------------------------------
    // Registered against the one shared timeline (lib/canvas/history) rather
    // than kept here, so a Ctrl+Z is chronological across node kinds instead
    // of draining this stack before the panel one.
    //
    // Snapshots hold live node references on purpose: re-creating a
    // Konva.Image on undo would reload its bitmap. That makes them valid only
    // while this layer lives, which is why the cleanup below clears the
    // timeline.
    const captureLayer = (): Snapshot => {
      const records = useKonvaNodes.getState().nodes;
      return (layer.find(".selectable") as Konva.Shape[]).map((n) => ({
        node: n,
        attrs: { ...n.getAttrs() },
        imageUrl: records[n.id()]?.imageUrl,
        label: records[n.id()]?.label,
      }));
    };

    const restoreSnapshot = (snap: Snapshot) => {
      transformer.nodes([]);
      // The store as well, or anything drawn from it -- a line's end
      // handles -- would outlive the selection the transformer just dropped.
      useKonvaSelection.getState().deselect();
      const snapSet = new Set(snap.map((s) => s.node));
      // Remove nodes absent from this snapshot, and their konvaNodes record
      // with them: labels and ports render from the record, so leaving it
      // behind shows the name and port of a node that is no longer there.
      (layer.find(".selectable") as Konva.Shape[]).forEach((n) => {
        if (snapSet.has(n)) return;
        if (n.id()) useKonvaNodes.getState().remove(n.id());
        n.remove();
      });
      // Restore attrs; re-add nodes that were previously removed.
      snap.forEach(({ node, attrs }) => {
        if (!node.getParent()) layer.add(node);
        node.setAttrs(attrs);
      });
      // Restore stacking. layer.find() returns ascending z, so the snapshot
      // array already encodes the order — raising each in turn replays it.
      // Without this, a drag that reordered nodes could not be undone.
      snap.forEach(({ node }) => node.moveToTop());
      syncAllNodeGeometry();
      // Only fill what is missing: a rename is not an undo step, so
      // overwriting a live label would quietly revert it.
      const records = useKonvaNodes.getState().nodes;
      snap.forEach(({ node, imageUrl, label }) => {
        const rec = records[node.id()];
        if (!rec) return;
        useKonvaNodes.getState().upsert({
          ...rec,
          imageUrl: rec.imageUrl ?? imageUrl,
          label: rec.label ?? label,
        });
      });
      applyDraggability(layer);
      hideHover(); // the hovered node may no longer exist in this snapshot
      updateSelectionChrome();
      layer.batchDraw();
    };

    const unregisterHistory = canvasHistory.register("konva", {
      capture: captureLayer,
      restore: (snap) => restoreSnapshot(snap as Snapshot),
    });

    const saveSnapshot = (coalesceKey?: object) => {
      saveFrameImagePositions(useFrames.getState().frames);
      canvasHistory.commit(coalesceKey);
    };

    // The transformer lives here and nowhere else, so selectOnly() cannot drop
    // node handles without a hand up from Board.
    registerNodeChromeClear(() => {
      transformer.nodes([]);
      updateSelectionChrome();
      layer.batchDraw();
    });

    // Snapshot initial state (demo node).
    canvasHistory.clear();
    canvasHistory.commit();
    let disposed = false;
    void restoreFrameImages(layer).then(() => {
      if (disposed) return;
      applyDraggability(layer);
      syncAllNodeGeometry();
      canvasHistory.commit();
    });

    // --- Stage events ---

    // Set when a frame draw has just finished on this release. The release
    // that ends a draw also produces a click on the empty stage, which would
    // otherwise clear the frame the draw has just selected. One-shot, and
    // reset on every press, so it can never swallow a click of its own.
    let releaseEndedDraw = false;
    stage.on("pointerdown.drawclick", () => {
      releaseEndedDraw = false;
    });

    // Click to select / deselect.
    stage.on("click tap", (e) => {
      if (releaseEndedDraw) {
        releaseEndedDraw = false;
        return;
      }
      // Clicking a selectable node always selects it — auto-switch to pointer
      // if the user is in another tool mode (matches Figma / Luma behaviour).
      if (e.target !== stage && e.target.hasName("selectable")) {
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
            hideHover();
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
          hideHover(); // transformer border takes over from here
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
    });

    bindWheelZoom(stage);

    // Where the current press began, in screen px. A drag handed to a frame
    // (#119) measures from here rather than from where Konva noticed it, or
    // the frame would trail the pointer by the drag threshold.
    let pressAt = { x: 0, y: 0 };
    stage.on("pointerdown.press", (e) => {
      pressAt = { x: e.evt.clientX, y: e.evt.clientY };
    });
    // The node whose drag went to its frame instead. Konva still fires
    // dragend for it on stopDrag, which must not commit an empty undo step.
    let handedOff: Konva.Node | null = null;

    // Drag begins: show the move cursor. Konva fires this only after the drag
    // threshold is passed, so a plain click never flashes it.
    stage.on("dragstart", (e) => {
      if (e.target !== stage && e.target.hasName("selectable")) {
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
            hideHover();
            dragFrameFrom(frame, pressAt);
            return;
          }
        }
        stage.container().style.cursor = "move";
        // Konva suppresses "click" once a drag begins, so a press-drag on an
        // unselected node never reaches the click handler's selection logic.
        // Leaving the old selection in place would point Delete and Ctrl+C at
        // a node the user is not touching. Already-selected nodes are left
        // alone so dragging one of a multi-selection keeps the group.
        if (!transformer.nodes().includes(n)) {
          transformer.nodes([n]);
          useKonvaSelection.getState().select(n.id() || String(n._id));
          useNodePanel.getState().closeAllPanels();
          useConnectionStore.getState().deselectConnection();
          hideHover(); // transformer border replaces the hover outline
        }
        // Raise the dragged node so it cannot vanish under something it is
        // being moved across. Selecting already raised it (#106); a drag of a
        // node that was already selected raises it again, in case something
        // newer has landed on top since.
        bringToFront(n);
        updateSelectionChrome();
        layer.batchDraw();
      }
    });

    // While dragging: sync viewport store so the NodePanel tracks in real-time.
    stage.on("dragmove", (e) => {
      if (e.target === stage) {
        // Keep viewport store live during pan so HTML overlays move with canvas.
        useViewport.getState().setPosition(stage.x(), stage.y());
        return;
      }
      // Konva node drag: keep the hover outline and port overlay in sync.
      if (e.target.hasName("selectable")) {
        showHover(e.target as Konva.Shape);
        syncNodeGeometry(e.target as Konva.Shape);
        updateSelectionChrome(); // outlines follow the moving node
        // One item over an auto layout row: show where it would land (#228).
        // Several move as before.
        const pt = stage.getRelativePointerPosition();
        if (pt && transformer.nodes().length <= 1) trackLayoutDrag(e.target.id(), pt);
      }
    });

    // Drag end → persist pan position; save snapshot on node drag.
    stage.on("dragend", (e) => {
      if (e.target === stage) {
        useViewport.getState().setPosition(stage.x(), stage.y());
      } else if (e.target === handedOff) {
        // Its frame is moving it; the frame commits the step when it lands.
        handedOff = null;
      } else if (e.target.hasName("selectable")) {
        stage.container().style.cursor = "default";
        syncNodeGeometry(e.target as Konva.Shape);
        // Into, within or out of an auto layout row, before the commit so the
        // drop and the new order are one undo step (#228).
        const pt = stage.getRelativePointerPosition();
        if (pt && transformer.nodes().length <= 1) dropIntoLayout(e.target.id(), pt);
        else clearLayoutDrag();
        saveSnapshot();
      }
    });

    // Keep port overlays in sync during transformer resize. Every selected node
    // moves under a multi-select resize, so sync all of them, not just the first.
    transformer.on("transform", () => {
      (transformer.nodes() as Konva.Shape[]).forEach((n) => {
        if (isBoardShape(n)) bakeScale(n);
        if (isBoardText(n)) bakeTextResize(n, transformer.getActiveAnchor());
        syncNodeGeometry(n);
      });
      updateSelectionChrome();
    });

    // Save snapshot after transformer resize / rotate commit.
    transformer.on("transformend", () => {
      saveSnapshot();
      (transformer.nodes() as Konva.Shape[]).forEach(syncNodeGeometry);
    });

    // Cursor: move over selectable nodes in pointer mode.
    stage.on("mouseover", (e) => {
      if (useToolStore.getState().activeTool !== "pointer") return;
      if (e.target !== stage && e.target.hasName("selectable")) {
        // Outline is the hover affordance; the move cursor is reserved for an
        // actual drag so it never claims "moving" while the node is at rest.
        showHover(e.target as Konva.Shape);
      }
    });
    stage.on("mouseout", (e) => {
      if (e.target !== stage && e.target.hasName("selectable")) {
        stage.container().style.cursor = "default";
        hideHover();
      }
    });

    // Cursor: grabbing while panning (regular pan mode or space-pan).
    //
    // "not pointer" used to be enough to mean "this tool pans", because every
    // non-pointer tool did. Frame is the first that draws instead, so it must
    // not advertise a pan it will never perform.
    stage.on("mousedown", () => {
      if (isSpacePanning.current || panningTool(useToolStore.getState().activeTool)) {
        stage.container().style.cursor = "grabbing";
      }
    });
    stage.on("mouseup", () => {
      // Only keep grab after releasing the mouse if spacebar is still held.
      if (isSpacePanning.current) {
        stage.container().style.cursor = "grab";
      } else {
        // Back to the armed tool's own cursor, not a blanket default: a
        // misclick while Frame is armed used to leave it without a crosshair.
        stage.container().style.cursor = cursorFor(useToolStore.getState().activeTool);
      }
    });

    // --- Window keyboard listeners ---

    // Space-to-pan: temporarily enable dragging regardless of active tool.
    const handleSpaceDown = (e: KeyboardEvent) => {
      if (!boardIsShown()) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code !== "Space" || isSpacePanning.current) return;
      e.preventDefault();
      isSpacePanning.current = true;
      stage.draggable(true);
      stage.container().style.cursor = "grab";
    };
    const handleSpaceUp = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !isSpacePanning.current) return;
      isSpacePanning.current = false;
      if (useToolStore.getState().activeTool === "pointer") {
        stage.draggable(false);
      }
      stage.container().style.cursor = "default";
    };
    window.addEventListener("keydown", handleSpaceDown);
    window.addEventListener("keyup", handleSpaceUp);

    // Ctrl/Cmd + Z → undo; Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z → redo.
    // The only undo/redo listener in the app. NodePanel used to run a second
    // one in capture phase and stopImmediatePropagation its way to priority;
    // with a single timeline there is nothing to arbitrate.
    const handleUndoRedo = (e: KeyboardEvent) => {
      // Not while another page covers the board (#206): an undo nobody can see.
      if (!boardIsShown()) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.code === "KeyZ" && !e.shiftKey) { e.preventDefault(); canvasHistory.undo(); }
      if (e.code === "KeyY" || (e.code === "KeyZ" && e.shiftKey)) { e.preventDefault(); canvasHistory.redo(); }
    };
    window.addEventListener("keydown", handleUndoRedo);

    // Ctrl/Cmd + A → select every uploaded image, node and wire.
    // Escape → clear all three. NodePanel's own Escape collapses the panels.
    const handleSelectAll = (e: KeyboardEvent) => {
      if (!boardIsShown()) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.target instanceof HTMLElement && e.target.isContentEditable) return;
      if (e.target instanceof Element && e.target.closest('[aria-modal="true"]')) return;

      if (e.code === "Escape") {
        selectOnly(null);
        updateSelectionChrome();
        layer.batchDraw();
        return;
      }

      if (!(e.ctrlKey || e.metaKey) || e.code !== "KeyA") return;
      // Otherwise the browser highlights every piece of text on the page.
      e.preventDefault();
      // Same rule as clicking a node: selecting implies the pointer tool,
      // or the selection could not be moved.
      if (useToolStore.getState().activeTool !== "pointer") {
        useToolStore.getState().setTool("pointer");
      }
      const nodes = layer.find(".selectable") as Konva.Shape[];
      selectNodes(transformer, nodes);
      if (!nodes.length) useKonvaSelection.getState().deselect();
      useNodePanel.getState().activateAll();
      useConnectionStore.getState().selectAllConnections();
      useFrames.getState().selectAll();
      hideHover(); // transformer borders take over
      updateSelectionChrome();
      layer.batchDraw();
    };
    window.addEventListener("keydown", handleSelectAll);

    const editKeys = createEditKeysHandler({
      layer, transformer,
      applyDraggability: () => applyDraggability(layer),
      syncAllNodeGeometry,
      updateSelectionChrome,
      saveSnapshot,
    });
    const handleEditKeys = (e: KeyboardEvent) => {
      if (boardIsShown()) editKeys(e);
    };
    window.addEventListener("keydown", handleEditKeys);

    // Place uploaded files on the canvas, centered in the current viewport.
    // Frame: drag on the board to draw a backdrop. The draw starts on the
    // stage, but once begun it is followed through window pointer events
    // (#118). Name labels, ports and wires are DOM above the canvas, so a
    // stage-bound draw read crossing one as the pointer leaving and cancelled
    // -- and a frame drawn corner to corner round an image runs straight
    // through its name. Each window event is fed back to the stage, so the
    // existing handlers see an ordinary pointer position wherever it is.
    //
    // Shapes draw through the same door. Only one tool is armed at a time, so
    // at most one of the two has a draw in progress; the other ignores every
    // call below.
    const frame = createFrameHandlers({ saveSnapshot });
    const shapeDraw = createShapeDrawHandlers({
      layer, transformer,
      applyDraggability: () => applyDraggability(layer),
      syncAllNodeGeometry,
      updateSelectionChrome,
      saveSnapshot,
    });
    // Text places through it too, and opens its editor on the release.
    const textTool = createTextTool({
      layer, transformer,
      applyDraggability: () => applyDraggability(layer),
      syncAllNodeGeometry,
      updateSelectionChrome,
      saveSnapshot,
    });
    const followMove = (e: PointerEvent) => {
      stage.setPointersPositions(e);
      frame.onMove(stage);
      shapeDraw.onMove(stage, e.shiftKey);
      textTool.onMove(stage);
    };
    const followUp = (e: PointerEvent) => {
      stage.setPointersPositions(e);
      unfollow();
      frame.onUp(stage);
      shapeDraw.onUp(stage, e.shiftKey);
      textTool.onUp(stage);
      // This runs on pointerup, before the stage sees the same release as a
      // click on empty board. Without this the click undid the selection.
      releaseEndedDraw = true;
    };
    // Losing the window or the gesture abandons the draw rather than leaving
    // a preview stranded. Escape is handled with the frame keys below.
    const abandon = () => {
      unfollow();
      frame.cancel();
      shapeDraw.cancel();
      textTool.cancel();
    };
    const unfollow = () => {
      window.removeEventListener("pointermove", followMove);
      window.removeEventListener("pointerup", followUp);
      window.removeEventListener("pointercancel", abandon);
      window.removeEventListener("blur", abandon);
    };
    stage.on("mousedown.frame touchstart.frame", () => {
      if (!frame.onDown(stage) && !shapeDraw.onDown(stage) && !textTool.onDown(stage)) return;
      window.addEventListener("pointermove", followMove);
      window.addEventListener("pointerup", followUp);
      window.addEventListener("pointercancel", abandon);
      window.addEventListener("blur", abandon);
    });

    // Double-click a text to edit it in place.
    stage.on("dblclick.text dbltap.text", (e) => {
      if (isBoardText(e.target)) textTool.edit(e.target);
    });

    const handleUpload = createUploadHandler({
      layer,
      applyDraggability: () => applyDraggability(layer),
      syncAllNodeGeometry,
      saveSnapshot,
    });
    window.addEventListener("canvas:upload", handleUpload);

    // A swatch picked in the dock recolours the selected shapes and text
    // (#159). Committed with the event as its key, so the Frames it also
    // recolours (FrameLayer) land in the same undo step.
    const handleColor = (e: Event) => {
      const { hex } = (e as CustomEvent<ColorDetail>).detail;
      if (!applyColor(transformer.nodes(), hex)) return;
      // Republished, so the style bar's dot (#161) shows the new colour.
      (transformer.nodes() as Konva.Shape[]).forEach(syncNodeGeometry);
      layer.batchDraw();
      saveSnapshot(e);
    };
    window.addEventListener(COLOR_EVENT, handleColor);

    // Files dragged in from the desktop. Window-level, because the browser
    // navigates away on a drop anywhere -- not just over the canvas.
    const dnd = createDragDropHandlers({
      // No canvas to drop on while another page covers it (#206): the drop is
      // still cancelled -- the browser must not navigate to the file -- but
      // nothing lands on the board and no affordance shows.
      area: () => (boardIsShown() ? canvasArea() : NO_AREA),
      setActive: setDropActive,
      onDrop: (files, at) => {
        window.dispatchEvent(new CustomEvent("canvas:upload", { detail: { files, at } }));
      },
    });
    window.addEventListener("dragenter", dnd.dragEnter);
    window.addEventListener("dragover", dnd.dragOver);
    window.addEventListener("dragleave", dnd.dragLeave);
    window.addEventListener("drop", dnd.drop);
    // A drag that ends outside the window never fires dragleave, so the
    // affordance would stick on until the next drag.
    window.addEventListener("dragend", dnd.reset);
    window.addEventListener("blur", dnd.reset);

    const handleFrameKeys = (e: KeyboardEvent) => {
      if (!boardIsShown()) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Escape") {
        frame.cancel();
        shapeDraw.cancel();
        textTool.cancel();
        return;
      }
      // Frames keep their own selection, so they need their own Delete. Keyed
      // on the event, so deleting a frame and a node together is one step.
      if (e.code === "Delete" || e.code === "Backspace") {
        const ids = useFrames.getState().selectedIds;
        if (!ids.length) return;
        ids.forEach((id) => useFrames.getState().remove(id));
        saveSnapshot(e);
      }
    };
    window.addEventListener("keydown", handleFrameKeys);

    // Clear board (#197). Everything goes, then one commit, so a single Ctrl+Z
    // brings it all back. Konva nodes are remove()d, not destroyed, for the
    // same reason as Delete: undo re-adds these very objects. The other kinds
    // go through the setters their own undo adapters restore with.
    const handleClear = () => {
      frame.cancel();
      shapeDraw.cancel();
      textTool.close();
      textTool.cancel();
      transformer.nodes([]);
      deleteNodes(layer.find(".selectable") as Konva.Shape[]);
      useKonvaSelection.getState().deselect();
      useNodePanel.getState().clearAll();
      useConnectionStore.getState().replaceConnections([]);
      useFrames.getState().replaceAll({});
      useFrames.getState().clearSelection();
      hideHover();
      syncAllNodeGeometry();
      updateSelectionChrome();
      layer.batchDraw();
      saveSnapshot();
    };
    window.addEventListener(CLEAR_EVENT, handleClear);

    // Puts a checked board (parseBoardFile) on the stage in place of what is
    // there, keeping its ids -- wires point at them. Shared by Open file (#199)
    // and by the restore after a reload (#203), which leaves the panels alone:
    // they rehydrate themselves.
    const placeBoard = (file: BoardFile, { panels }: { panels: boolean }) => {
      frame.cancel();
      shapeDraw.cancel();
      textTool.close();
      textTool.cancel();
      transformer.nodes([]);
      deleteNodes(layer.find(".selectable") as Konva.Shape[]);
      useKonvaSelection.getState().deselect();

      file.nodes.forEach((entry) => {
        const attrs: Record<string, unknown> = { ...entry.attrs, name: "selectable" };
        if (entry.className === "Image" && entry.imageUrl) {
          // Neither survives JSON. The picture decodes after the node is
          // placed, so the layer redraws once it has.
          const img = new window.Image();
          img.onload = () => layer.batchDraw();
          img.src = entry.imageUrl;
          attrs.image = img;
          attrs.hitFunc = imageHitFunc;
        }
        const node = createNode(entry.className, attrs);
        layer.add(node);
        if (entry.imageUrl || entry.label) {
          useKonvaNodes.getState().upsert({
            id: node.id(),
            canvasX: node.x(),
            canvasY: node.y(),
            canvasW: node.width() * node.scaleX(),
            canvasH: node.height() * node.scaleY(),
            imageUrl: entry.imageUrl,
            label: entry.label,
          });
        }
      });

      if (panels) useNodePanel.getState().loadPanels(file.panels);
      useFrames.getState().replaceAll(Object.fromEntries(file.frames.map((f) => [f.id, f])));
      useFrames.getState().clearSelection();
      useConnectionStore.getState().replaceConnections(file.connections);
      useLayerOrder.setState({ topLayer: file.topLayer });
      applyDraggability(layer);
      hideHover();
      syncAllNodeGeometry();
      updateSelectionChrome();
      layer.batchDraw();
    };

    // Open file (#199): the board becomes the file's, as one undo step.
    const handleLoad = (e: Event) => {
      placeBoard((e as CustomEvent<BoardFile>).detail, { panels: true });
      saveSnapshot();
    };
    window.addEventListener(LOAD_EVENT, handleLoad);

    // The board as it was before the reload (#203). The restored board is the
    // first undo entry, not a step: there is nothing before it to go back to.
    // Saving starts only after this, so the empty stage that exists until now
    // can never overwrite what was saved.
    const saved = readSavedCanvas();
    if (saved) {
      placeBoard(saved, { panels: false });
      canvasHistory.clear();
      saveSnapshot();
    }
    const stopPersistence = startCanvasPersistence(() => layerRef.current);

    const observer = new ResizeObserver(() => {
      stage.width(container.offsetWidth);
      stage.height(container.offsetHeight);
    });
    observer.observe(container);

    return () => {
      disposed = true;
      window.removeEventListener("keydown", handleSpaceDown);
      window.removeEventListener("keyup", handleSpaceUp);
      window.removeEventListener("keydown", handleUndoRedo);
      window.removeEventListener("keydown", handleSelectAll);
      window.removeEventListener("keydown", handleEditKeys);
      window.removeEventListener("canvas:upload", handleUpload);
      window.removeEventListener(COLOR_EVENT, handleColor);
      window.removeEventListener("dragenter", dnd.dragEnter);
      window.removeEventListener("dragover", dnd.dragOver);
      window.removeEventListener("dragleave", dnd.dragLeave);
      window.removeEventListener("drop", dnd.drop);
      window.removeEventListener("dragend", dnd.reset);
      window.removeEventListener("blur", dnd.reset);
      window.removeEventListener("keydown", handleFrameKeys);
      window.removeEventListener(CLEAR_EVENT, handleClear);
      window.removeEventListener(LOAD_EVENT, handleLoad);
      // Before the stage goes: a pending save reads it.
      stopPersistence();
      stage.off(".frame");
      stage.off(".text");
      textTool.close();
      unfollow();
      observer.disconnect();
      registerNodeChromeClear(null);
      boardStage.current = null;
      // Entries hold references into this layer, so they outlive their
      // meaning once the stage is gone.
      unregisterHistory();
      canvasHistory.clear();
      stage.destroy();
      stageRef.current = null;
      layerRef.current = null;
      transformerRef.current = null;
      hoverRef.current = null;
    };
  }, [updateSelectionChrome]);

  // Sync viewport store → Konva stage.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.position({ x, y });
    stage.scale({ x: scale, y: scale });
    stage.batchDraw();
  }, [x, y, scale]);

  // When konvaSelection is cleared from outside (NodePanel/ConnectionOverlay click),
  // also clear the Konva transformer so the selection ring disappears.
  useEffect(() => {
    return useKonvaSelection.subscribe((s) => {
      if (!s.nodeIds.length && transformerRef.current && layerRef.current) {
        transformerRef.current.nodes([]);
        updateSelectionChrome();
        layerRef.current.batchDraw();
      }
    });
  }, [updateSelectionChrome]);

  // When the canvas is the front layer it covers the whole viewport, so it
  // would swallow every click meant for a node placeholder underneath --
  // including placeholders nowhere near an image. Let events pass through
  // except where a shape actually is.
  //
  // Only runs while the canvas is in front; in the normal case the container
  // stays plainly interactive and this costs nothing.
  useEffect(() => {
    const stage = stageRef.current;
    const container = containerRef.current;
    if (!stage || !container) return;

    // Frame and shape tools draw by dragging from empty space, which is exactly
    // what the pass-through below makes unreachable: it only turns the
    // container interactive where a shape already is. Without this exception
    // no frame could be drawn at all once an upload had raised the canvas.
    // While drawing, this container must receive the whole gesture: the
    // pass-through below only keeps it interactive where a shape already is,
    // which is exactly where a frame drag does NOT start.
    if (drawingTool(activeTool)) {
      container.style.pointerEvents = "auto";
      return;
    }

    // Placeholders are the only DOM under a raised canvas: wires, ports,
    // labels and an open form all paint above it. A small margin takes in
    // the corner anchors, which sit just outside the node's box.
    const ANCHOR_MARGIN = 8;
    const overPlaceholder = (clientX: number, clientY: number) => {
      const { x: vx, y: vy, scale } = useViewport.getState();
      return useNodePanel.getState().panels.some((p) => {
        const b = boundsOf(p);
        const left = vx + b.x * scale - ANCHOR_MARGIN;
        const top = vy + b.y * scale - ANCHOR_MARGIN;
        return (
          clientX >= left && clientX <= left + b.w * scale + 2 * ANCHOR_MARGIN &&
          clientY >= top && clientY <= top + b.h * scale + 2 * ANCHOR_MARGIN
        );
      });
    };

    const update = (e: PointerEvent) => {
      const r = container.getBoundingClientRect();
      const pt = { x: e.clientX - r.left, y: e.clientY - r.top };
      const hit = stage.getIntersection(pt);
      const overFrame = !!frameStage.current?.getIntersection(pt);
      // Two reasons to let a click through, and only where none of our own
      // shapes is under the cursor:
      //   over a placeholder, canvas in front — so it does not swallow
      //                     clicks meant for the Create node underneath
      //                     (the original reason)
      //   over bare frame — so the frames stage below can be clicked at all
      // Anywhere else stays interactive, or the background click that
      // deselects and disarms the tool would never arrive. It used to pass
      // through over ALL empty board while the canvas was in front -- which
      // it is after every upload -- so a click on empty board reached the page
      // instead, and an uploaded image stayed selected (#105). The wheel went
      // the same way, so zoom stopped working too.
      const overPanel = topLayer === "canvas" && overPlaceholder(e.clientX, e.clientY);
      const passThrough = !hit && (overPanel || overFrame);
      container.style.pointerEvents = passThrough ? "none" : "auto";
    };

    // Interactive until the pointer says otherwise, in either layer order:
    // empty board must always receive the click that deselects, and the
    // wheel. update() lifts it only over a placeholder or a bare frame.
    container.style.pointerEvents = "auto";
    window.addEventListener("pointermove", update);
    return () => {
      window.removeEventListener("pointermove", update);
      container.style.pointerEvents = "auto";
    };
  }, [topLayer, activeTool]);

  // Switch between pointer (select) mode and pan mode.
  useEffect(() => {
    const stage = stageRef.current;
    const transformer = transformerRef.current;
    const layer = layerRef.current;
    if (!stage || !transformer || !layer) return;

    if (activeTool === "pointer") {
      stage.draggable(false);
      stage.container().style.cursor = "default";
      applyDraggability(layer);
    } else {
      // Frame draws on drag, so the stage must not pan underneath it. Every
      // other non-pointer tool still pans.
      stage.draggable(panningTool(activeTool));
      stage.container().style.cursor = cursorFor(activeTool);
      // A node's open form sits above the whole board (Z_INDEX.panelForm),
      // so a draw that crossed it would land on the form instead and nothing
      // would be drawn. Arming a drawing tool means the edit is over: fold the
      // form back to a selected node, the same as clicking its placeholder.
      if (drawingTool(activeTool)) {
        const { panels, closePanel } = useNodePanel.getState();
        panels.filter((p) => p.isPanelOpen).forEach((p) => closePanel(p.id));
      }
      transformer.nodes([]);
      updateSelectionChrome();
      hoverRef.current?.hide();
      applyDraggability(layer);
      layer.batchDraw();
    }
  }, [activeTool, updateSelectionChrome]);

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: "fixed",
          inset: 0,
          overflow: "hidden",
          // The whole canvas moves above or below the node placeholders; it
          // cannot interleave with them. See layerOrder.store.
          // While a drawing tool is armed the canvas must be the top surface:
          // a draw that crossed a Create placeholder used to be lost, because
          // the placeholder is a DOM element above the canvas whenever the
          // canvas is the lower layer, and the browser retargets the rest of
          // the gesture to it.
          zIndex:
            drawingTool(activeTool)
              ? Z_INDEX.canvasAbove
              : topLayer === "canvas"
                ? Z_INDEX.canvasAbove
                : Z_INDEX.canvasBelow,
        }}
      />

      {/* Drop affordance. Inset to the visible canvas rather than the window,
          so it does not draw underneath the sidebar. pointer-events: none is
          load-bearing: an overlay that swallowed the drop would stop it ever
          reaching the window listener. */}
      {dropActive && (
        <div
          data-testid="canvas-drop-overlay"
          style={{
            position: "fixed",
            left: dropArea.left ?? 0,
            top: dropArea.top ?? 0,
            width: dropArea.width,
            height: dropArea.height,
            pointerEvents: "none",
            zIndex: Z_INDEX.dropOverlay,
            background: "rgba(0,0,0,0.04)",
            border: `2px dashed ${COLORS.ink}`,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontSize: 13,
              color: COLORS.ink,
              background: COLORS.paper,
              padding: "6px 12px",
              borderRadius: 999,
              boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
            }}
          >
            Drop images to add them to the board
          </span>
        </div>
      )}
    </>
  );
}

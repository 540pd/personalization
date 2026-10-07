"use client";

import { useCallback, useEffect, useRef } from "react";
import Konva from "konva";
import { useViewport } from "@/store/viewport.store";
import { useToolStore } from "@/store/tool.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useConnectionStore } from "@/store/connection.store";
import { COLORS, DEFAULT_NODE_MAX_EDGE, MIN_NODE_SIZE, NODE_CORNER_RADIUS, SELECTION } from "@/constants/canvas.constants";

const raw = Number(process.env.NEXT_PUBLIC_UNDO_HISTORY_LIMIT);
const UNDO_LIMIT = Number.isFinite(raw) && raw > 0 ? raw : 10;

// "photo-2024.final.png" -> "photo-2024.final". Only the last segment is an
// extension; names with dots in them keep them.
function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}
// Nodes are draggable only in pointer mode. Sole owner of that rule: call it
// after adding a node and whenever the active tool changes. Reading the tool
// here rather than capturing it at construction is what keeps a node created
// under another tool from staying permanently undraggable.
function applyDraggability(layer: Konva.Layer) {
  const draggable = useToolStore.getState().activeTool === "pointer";
  (layer.find(".selectable") as Konva.Shape[]).forEach((n) => n.draggable(draggable));
}

type Snapshot = Array<{ node: Konva.Shape; attrs: Record<string, unknown> }>;

export default function Board() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const layerRef = useRef<Konva.Layer | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const hoverOutlineRef = useRef<Konva.Rect | null>(null);
  const isSpacePanning = useRef(false);

  // A multi-selection is drawn as one outline per image rather than a single
  // combined box, so it is obvious which images are in it. The transformer's
  // own border and handles are suppressed while multi-selected, but its node
  // list is left intact — it stays the source of truth for Delete / Ctrl+C
  // and for the dragstart selection check.
  const updateSelectionChrome = useCallback(() => {
    const layer = layerRef.current;
    const transformer = transformerRef.current;
    if (!layer || !transformer) return;

    const sel = transformer.nodes() as Konva.Shape[];
    const multi = sel.length > 1;
    transformer.borderEnabled(!multi);
    transformer.resizeEnabled(!multi);

    const pool = () => layer.find(".selection-outline") as Konva.Rect[];
    for (let i = pool().length; i < sel.length; i++) {
      layer.add(
        new Konva.Rect({
          name: "selection-outline",
          stroke: COLORS.ink,
          strokeWidth: SELECTION.borderWidth,
          strokeScaleEnabled: false, // constant 1.5px at every zoom
          listening: false,
        })
      );
    }
    const needed = multi ? sel.length : 0;
    pool().forEach((r, i) => {
      if (i >= needed) {
        r.visible(false);
        return;
      }
      const n = sel[i];
      r.position({ x: n.x(), y: n.y() });
      r.size({ width: n.width() * n.scaleX(), height: n.height() * n.scaleY() });
      r.cornerRadius((n.getAttr("cornerRadius") as number) ?? 0);
      r.visible(true);
      r.moveToTop();
    });
    transformer.moveToTop();
    layer.batchDraw();
  }, []);

  const { x, y, scale } = useViewport();
  const { activeTool } = useToolStore();

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
        if (newBox.width / s < MIN_NODE_SIZE || newBox.height / s < MIN_NODE_SIZE) return oldBox;
        return newBox;
      },
    });
    layer.add(transformer);

    // Hover affordance: a borrowed outline that follows whichever node the
    // cursor is over. Kept as its own node (not a stroke on the shape) so it
    // never lands in undo snapshots or the copy/paste clipboard.
    const hoverOutline = new Konva.Rect({
      name: "hover-outline",
      stroke: COLORS.ink,
      strokeWidth: SELECTION.borderWidth,
      strokeScaleEnabled: false, // constant 1.5px at every zoom level
      listening: false,
      visible: false,
    });
    layer.add(hoverOutline);

    stageRef.current = stage;
    layerRef.current = layer;
    transformerRef.current = transformer;
    hoverOutlineRef.current = hoverOutline;

    const hideHover = () => {
      if (!hoverOutline.visible()) return;
      hoverOutline.visible(false);
      layer.batchDraw();
    };

    const showHover = (n: Konva.Shape) => {
      // A selected node already draws the transformer border — showing this on
      // top would double it, so hover stays the unselected-only affordance.
      if (useToolStore.getState().activeTool !== "pointer" || transformer.nodes().includes(n)) {
        hideHover();
        return;
      }
      hoverOutline.position({ x: n.x(), y: n.y() });
      hoverOutline.size({ width: n.width() * n.scaleX(), height: n.height() * n.scaleY() });
      hoverOutline.cornerRadius((n.getAttr("cornerRadius") as number) ?? 0);
      hoverOutline.visible(true);
      hoverOutline.moveToTop(); // shapes are added after the layer's chrome
      layer.batchDraw();
    };

    // --- Undo / redo (snapshot-based, reference-safe for Konva.Image) ---
    const historySnaps: Snapshot[] = [];
    let historyIdx = -1;

    const saveSnapshot = () => {
      const snap: Snapshot = (layer.find(".selectable") as Konva.Shape[]).map((n) => ({
        node: n,
        attrs: { ...n.getAttrs() },
      }));
      historySnaps.splice(historyIdx + 1); // discard redo stack
      historySnaps.push(snap);
      if (historySnaps.length > UNDO_LIMIT) historySnaps.shift();
      historyIdx = historySnaps.length - 1;
    };

    const restoreSnapshot = (snap: Snapshot) => {
      transformer.nodes([]);
      const snapSet = new Set(snap.map((s) => s.node));
      // Remove nodes absent from this snapshot.
      (layer.find(".selectable") as Konva.Shape[]).forEach((n) => {
        if (!snapSet.has(n)) n.remove();
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
      applyDraggability(layer);
      hideHover(); // the hovered node may no longer exist in this snapshot
      updateSelectionChrome();
      layer.batchDraw();
    };

    const undo = () => {
      if (historyIdx <= 0) return;
      historyIdx--;
      restoreSnapshot(historySnaps[historyIdx]);
    };

    const redo = () => {
      if (historyIdx >= historySnaps.length - 1) return;
      historyIdx++;
      restoreSnapshot(historySnaps[historyIdx]);
    };

    // Snapshot initial state (demo node).
    saveSnapshot();

    // Publish a node's geometry to konvaNodes — the single source the port
    // overlays and connection wires read. Called on every move/resize frame so
    // the overlays track the shape live, not just on gesture end.
    const syncNodeGeometry = (n: Konva.Shape) => {
      const id = n.id();
      if (!id) return;
      useKonvaNodes.getState().upsert({
        id,
        canvasX: n.x(),
        canvasY: n.y(),
        canvasW: n.width()  * n.scaleX(),
        canvasH: n.height() * n.scaleY(),
        z: n.zIndex(),
      });
    };

    // Raising one node shifts everyone else's index, so z-order changes need a
    // full republish — a single-node sync would leave the others stale and a
    // port would hide or show against the wrong stacking.
    const syncAllNodeGeometry = () => {
      (layer.find(".selectable") as Konva.Shape[]).forEach(syncNodeGeometry);
    };

    // --- Stage events ---

    // Click to select / deselect.
    stage.on("click tap", (e) => {
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
          }
          updateSelectionChrome();
        } else {
          // Normal click: single-select, clear everything else.
          transformer.nodes([n]);
          // The transformer is created before any shape exists, so it would
          // otherwise sit at the bottom of the layer and its border and handles
          // would be hidden behind whatever overlaps the selected node.
          updateSelectionChrome();
          hideHover(); // transformer border takes over from here
          useKonvaSelection.getState().select(id);
          useNodePanel.getState().closeAllPanels();
          useConnectionStore.getState().deselectConnection();
        }
        layer.batchDraw();
        return;
      }

      // Always close node panels on background click, regardless of active tool.
      useNodePanel.getState().closeAllPanels();
      useKonvaSelection.getState().deselect();
      useConnectionStore.getState().deselectConnection();
      // Only clear transformer selection in pointer mode.
      if (useToolStore.getState().activeTool !== "pointer") return;
      transformer.nodes([]);
      updateSelectionChrome();
      layer.batchDraw();
    });

    // Wheel → zoom toward cursor.
    stage.on("wheel", (e) => {
      e.evt.preventDefault();
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      useViewport.getState().zoomToPoint(e.evt.deltaY, pointer.x, pointer.y);
    });

    // Drag begins: show the move cursor. Konva fires this only after the drag
    // threshold is passed, so a plain click never flashes it.
    stage.on("dragstart", (e) => {
      if (e.target !== stage && e.target.hasName("selectable")) {
        const n = e.target as Konva.Shape;
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
        // being moved across. Tied to drag, not selection: moving a node is a
        // deliberate edit, whereas merely clicking one should not reorder it.
        n.moveToTop();
        syncAllNodeGeometry();
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
      }
    });

    // Drag end → persist pan position; save snapshot on node drag.
    stage.on("dragend", (e) => {
      if (e.target === stage) {
        useViewport.getState().setPosition(stage.x(), stage.y());
      } else if (e.target.hasName("selectable")) {
        stage.container().style.cursor = "default";
        saveSnapshot();
        syncNodeGeometry(e.target as Konva.Shape);
      }
    });

    // Keep port overlays in sync during transformer resize. Every selected node
    // moves under a multi-select resize, so sync all of them, not just the first.
    transformer.on("transform", () => {
      (transformer.nodes() as Konva.Shape[]).forEach(syncNodeGeometry);
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
    stage.on("mousedown", () => {
      if (isSpacePanning.current || useToolStore.getState().activeTool !== "pointer") {
        stage.container().style.cursor = "grabbing";
      }
    });
    stage.on("mouseup", () => {
      // Only keep grab after releasing the mouse if spacebar is still held.
      if (isSpacePanning.current) {
        stage.container().style.cursor = "grab";
      } else {
        stage.container().style.cursor = "default";
      }
    });

    // --- Window keyboard listeners ---

    // Space-to-pan: temporarily enable dragging regardless of active tool.
    const handleSpaceDown = (e: KeyboardEvent) => {
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
    const handleUndoRedo = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.code === "KeyZ" && !e.shiftKey) { e.preventDefault(); undo(); }
      if (e.code === "KeyY" || (e.code === "KeyZ" && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handleUndoRedo);

    // --- Delete / Copy / Paste ---
    // One entry per copied node, so a multi-selection round-trips intact.
    // imageUrl is carried alongside the Konva attrs because it lives in
    // konvaNodes, not on the shape — without it a pasted image cannot be used
    // as a generation reference.
    let clipboard: Array<{
      className: string;
      attrs: Record<string, unknown>;
      imageUrl?: string;
    }> = [];

    const handleEditKeys = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const mod = e.ctrlKey || e.metaKey;
      const selected = transformer.nodes() as Konva.Shape[];

      // Delete / Backspace → remove selected nodes.
      if (e.code === "Delete" || e.code === "Backspace") {
        if (!selected.length) return;
        e.preventDefault();
        transformer.nodes([]);
        updateSelectionChrome();
        selected.forEach((n) => {
          const nId = n.id();
          if (nId) useKonvaNodes.getState().remove(nId);
          n.destroy();
        });
        syncAllNodeGeometry();
        useKonvaSelection.getState().deselect();
        saveSnapshot();
        return;
      }

      // Ctrl+C → copy every selected node.
      if (mod && e.code === "KeyC") {
        if (!selected.length) return;
        const registered = useKonvaNodes.getState().nodes;
        clipboard = selected.map((n) => ({
          className: n.getClassName(),
          attrs: { ...n.getAttrs() },
          imageUrl: registered[n.id()]?.imageUrl,
        }));
        return;
      }

      // Ctrl+V → paste every copied node at a +20px offset, all left selected.
      if (mod && e.code === "KeyV") {
        if (!clipboard.length) return;
        e.preventDefault();
        const pasted = clipboard.map((entry) => {
          // A fresh id, never undefined: syncNodeGeometry skips id-less nodes,
          // so an id-less paste would never reach konvaNodes and would end up
          // with no port and no way to connect it to anything.
          const id = crypto.randomUUID();
          const attrs = {
            ...entry.attrs,
            x: ((entry.attrs.x as number) ?? 0) + 20,
            y: ((entry.attrs.y as number) ?? 0) + 20,
            id,
            name: "selectable",
          };
          const node: Konva.Shape =
            entry.className === "Image"
              ? new Konva.Image(attrs as Konva.ImageConfig)
              : new Konva.Rect(attrs as Konva.RectConfig);
          layer.add(node);
          if (entry.imageUrl) {
            useKonvaNodes.getState().upsert({
              id,
              canvasX: node.x(),
              canvasY: node.y(),
              canvasW: node.width()  * node.scaleX(),
              canvasH: node.height() * node.scaleY(),
              imageUrl: entry.imageUrl,
            });
          }
          return node;
        });
        applyDraggability(layer);
        syncAllNodeGeometry();
        transformer.nodes(pasted);
        const sel = useKonvaSelection.getState();
        sel.select(pasted[0].id());
        pasted.slice(1).forEach((n) => sel.addToSelection(n.id()));
        updateSelectionChrome();
        layer.batchDraw();
        saveSnapshot();
      }
    };
    window.addEventListener("keydown", handleEditKeys);

    // Place uploaded files on the canvas, centered in the current viewport.
    const handleUpload = (e: Event) => {
      const { files } = (e as CustomEvent<{ files: File[] }>).detail as { files: File[] };
      // Return to pointer so the just-added node can be moved straight away.
      // Without this an upload under a link/shape tool lands a node that cannot
      // be dragged, and the press pans the board instead — matches the dock's
      // generate-image behaviour.
      useToolStore.getState().setTool("pointer");
      const { x: sx, y: sy, scale: s } = useViewport.getState();
      const cx = -sx / s + window.innerWidth  / (2 * s);
      const cy = -sy / s + window.innerHeight / (2 * s);

      files.forEach((file, i) => {
        const off = i * 24;
        if (file.type.startsWith("image/")) {
          const url = URL.createObjectURL(file);
          const img = new window.Image() as HTMLImageElement;
          img.onload = () => {
            // Fit inside the box in both directions. Aspect ratio is
            // preserved, and images already smaller than it keep their natural
            // size — scaling them up would only blur them.
            const ratio = Math.min(
              1,
              DEFAULT_NODE_MAX_EDGE / img.naturalWidth,
              DEFAULT_NODE_MAX_EDGE / img.naturalHeight
            );
            const w = img.naturalWidth  * ratio;
            const h = img.naturalHeight * ratio;
            const imgNodeId = crypto.randomUUID();
            const node = new Konva.Image({
              id: imgNodeId,
              image: img,
              x: cx - w / 2 + off,
              y: cy - h / 2 + off,
              width: w,
              height: h,
              name: "selectable",
              cornerRadius: NODE_CORNER_RADIUS,
              // Force bounding-rect hit detection so clicks on transparent PNG
              // areas still register (Konva default uses per-pixel alpha for images).
              hitFunc(ctx: Konva.Context, shape: Konva.Shape) {
                ctx.beginPath();
                ctx.rect(0, 0, shape.width(), shape.height());
                ctx.closePath();
                ctx.fillStrokeShape(shape);
              },
            });
            // Convert to data URL so downstream AI nodes can send it to the backend.
            const canvas = document.createElement("canvas");
            canvas.width = w; canvas.height = h;
            canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
            const imageUrl = canvas.toDataURL("image/png");
            useKonvaNodes.getState().upsert({
              id: imgNodeId,
              canvasX: cx - w / 2 + off,
              canvasY: cy - h / 2 + off,
              canvasW: w,
              canvasH: h,
              imageUrl,
              label: stripExtension(file.name),
            });
            layer.add(node);
            applyDraggability(layer);
            syncAllNodeGeometry();
            layer.batchDraw();
            saveSnapshot();
          };
          img.src = url;
        } else {
          // Video / audio — placeholder rect until media nodes are fully supported.
          const w = 240;
          const h = file.type.startsWith("video/") ? 135 : 64;
          const rectNodeId = crypto.randomUUID();
          const node = new Konva.Rect({
            id: rectNodeId,
            x: cx - w / 2 + off,
            y: cy - h / 2 + off,
            width: w,
            height: h,
            fill: COLORS.mediaFill,
            stroke: COLORS.mediaStroke,
            strokeWidth: 1.5,
            cornerRadius: 8,
            name: "selectable",
          });
          useKonvaNodes.getState().upsert({
            id: rectNodeId,
            canvasX: cx - w / 2 + off,
            canvasY: cy - h / 2 + off,
            canvasW: w,
            canvasH: h,
          });
          layer.add(node);
          applyDraggability(layer);
          syncAllNodeGeometry();
          layer.batchDraw();
          saveSnapshot();
        }
      });
    };
    window.addEventListener("canvas:upload", handleUpload);

    const observer = new ResizeObserver(() => {
      stage.width(container.offsetWidth);
      stage.height(container.offsetHeight);
    });
    observer.observe(container);

    return () => {
      window.removeEventListener("keydown", handleSpaceDown);
      window.removeEventListener("keyup", handleSpaceUp);
      window.removeEventListener("keydown", handleUndoRedo);
      window.removeEventListener("keydown", handleEditKeys);
      window.removeEventListener("canvas:upload", handleUpload);
      observer.disconnect();
      stage.destroy();
      stageRef.current = null;
      layerRef.current = null;
      transformerRef.current = null;
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
      stage.draggable(true);
      stage.container().style.cursor = "default";
      transformer.nodes([]);
      updateSelectionChrome();
      hoverOutlineRef.current?.visible(false);
      applyDraggability(layer);
      layer.batchDraw();
    }
  }, [activeTool, updateSelectionChrome]);

  return (
    <div
      ref={containerRef}
      style={{ position: "fixed", inset: 0, overflow: "hidden" }}
    />
  );
}

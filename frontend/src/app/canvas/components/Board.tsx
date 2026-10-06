"use client";

import { useEffect, useRef } from "react";
import Konva from "konva";
import { useViewport } from "@/store/viewport.store";
import { useToolStore } from "@/store/tool.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useConnectionStore } from "@/store/connection.store";

const raw = Number(process.env.NEXT_PUBLIC_UNDO_HISTORY_LIMIT);
const UNDO_LIMIT = Number.isFinite(raw) && raw > 0 ? raw : 10;
// Smallest on-screen size (px) a node can be resized to.
const MIN_NODE_SIZE = 20;

type Snapshot = Array<{ node: Konva.Shape; attrs: Record<string, unknown> }>;

export default function Board() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const layerRef = useRef<Konva.Layer | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const isSpacePanning = useRef(false);

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
      // A flip makes scaleX/scaleY negative, so the geometry synced to
      // konvaNodes no longer matches the shape and its ports detach.
      flipEnabled: false,
      // Stop shrinking at a minimum size instead of collapsing to zero.
      boundBoxFunc: (oldBox, newBox) =>
        newBox.width < MIN_NODE_SIZE || newBox.height < MIN_NODE_SIZE ? oldBox : newBox,
      enabledAnchors: ["top-left", "top-right", "bottom-left", "bottom-right"],
      borderStroke: "#000000",
      borderStrokeWidth: 1.5,
      anchorStroke: "#000000",
      anchorFill: "#ffffff",
      anchorSize: 8,
      anchorCornerRadius: 2,
      padding: 4,
    });
    layer.add(transformer);

    stageRef.current = stage;
    layerRef.current = layer;
    transformerRef.current = transformer;

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
      // Re-apply draggable per active tool.
      const tool = useToolStore.getState().activeTool;
      (layer.find(".selectable") as Konva.Shape[]).forEach((n) => {
        n.draggable(tool === "pointer");
      });
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
      });
    };

    // --- Stage events ---

    // Click to select / deselect.
    stage.on("click tap", (e) => {
      // Clicking a selectable node always selects it — auto-switch to pointer
      // if the user is in another tool mode (matches Figma / Luma behaviour).
      if (e.target !== stage && e.target.hasName("selectable")) {
        if (useToolStore.getState().activeTool !== "pointer") {
          useToolStore.getState().setTool("pointer");
          stage.container().style.cursor = "move";
        }
        const n  = e.target as Konva.Shape;
        const id = n.id() || String(n._id);
        const isMulti = e.evt.ctrlKey || e.evt.metaKey;

        if (isMulti) {
          // Ctrl+click: toggle this node in/out of the selection.
          const current = transformer.nodes() as Konva.Shape[];
          const alreadyIn = current.includes(n);
          if (alreadyIn) {
            transformer.nodes(current.filter((node) => node !== n));
            useKonvaSelection.getState().removeFromSelection(id);
          } else {
            transformer.nodes([...current, n]);
            useKonvaSelection.getState().addToSelection(id);
          }
        } else {
          // Normal click: single-select, clear everything else.
          transformer.nodes([n]);
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
      layer.batchDraw();
    });

    // Wheel → zoom toward cursor.
    stage.on("wheel", (e) => {
      e.evt.preventDefault();
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      useViewport.getState().zoomToPoint(e.evt.deltaY, pointer.x, pointer.y);
    });

    // While dragging: sync viewport store so the NodePanel tracks in real-time.
    stage.on("dragmove", (e) => {
      if (e.target === stage) {
        // Keep viewport store live during pan so HTML overlays move with canvas.
        useViewport.getState().setPosition(stage.x(), stage.y());
        return;
      }
      // Konva node drag: keep port overlay in sync.
      if (e.target.hasName("selectable")) {
        syncNodeGeometry(e.target as Konva.Shape);
      }
    });

    // Drag end → persist pan position; save snapshot on node drag.
    stage.on("dragend", (e) => {
      if (e.target === stage) {
        useViewport.getState().setPosition(stage.x(), stage.y());
      } else if (e.target.hasName("selectable")) {
        saveSnapshot();
        syncNodeGeometry(e.target as Konva.Shape);
      }
    });

    // Keep port overlays in sync during transformer resize. Every selected node
    // moves under a multi-select resize, so sync all of them, not just the first.
    transformer.on("transform", () => {
      (transformer.nodes() as Konva.Shape[]).forEach(syncNodeGeometry);
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
        stage.container().style.cursor = "move";
      }
    });
    stage.on("mouseout", (e) => {
      if (e.target !== stage && e.target.hasName("selectable")) {
        stage.container().style.cursor = "default";
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
    let clipboard: { className: string; attrs: Record<string, unknown> } | null = null;

    const handleEditKeys = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const mod = e.ctrlKey || e.metaKey;
      const selected = transformer.nodes() as Konva.Shape[];

      // Delete / Backspace → remove selected nodes.
      if (e.code === "Delete" || e.code === "Backspace") {
        if (!selected.length) return;
        e.preventDefault();
        transformer.nodes([]);
        selected.forEach((n) => {
          const nId = n.id();
          if (nId) useKonvaNodes.getState().remove(nId);
          n.destroy();
        });
        useKonvaSelection.getState().deselect();
        saveSnapshot();
        return;
      }

      // Ctrl+C → copy attrs of the first selected node.
      if (mod && e.code === "KeyC") {
        if (!selected.length) return;
        clipboard = { className: selected[0].getClassName(), attrs: { ...selected[0].getAttrs() } };
        return;
      }

      // Ctrl+V → paste with +20px offset, select the new node.
      if (mod && e.code === "KeyV") {
        if (!clipboard) return;
        e.preventDefault();
        const pasteAttrs = {
          ...clipboard.attrs,
          x: ((clipboard.attrs.x as number) ?? 0) + 20,
          y: ((clipboard.attrs.y as number) ?? 0) + 20,
          id: undefined,
          name: "selectable",
          draggable: useToolStore.getState().activeTool === "pointer",
        };
        const node: Konva.Shape =
          clipboard.className === "Image"
            ? new Konva.Image(pasteAttrs as Konva.ImageConfig)
            : new Konva.Rect(pasteAttrs as Konva.RectConfig);
        layer.add(node);
        transformer.nodes([node]);
        layer.batchDraw();
        saveSnapshot();
      }
    };
    window.addEventListener("keydown", handleEditKeys);

    // Place uploaded files on the canvas, centered in the current viewport.
    const handleUpload = (e: Event) => {
      const { files } = (e as CustomEvent<{ files: File[] }>).detail as { files: File[] };
      const { x: sx, y: sy, scale: s } = useViewport.getState();
      const cx = -sx / s + window.innerWidth  / (2 * s);
      const cy = -sy / s + window.innerHeight / (2 * s);

      files.forEach((file, i) => {
        const off = i * 24;
        if (file.type.startsWith("image/")) {
          const url = URL.createObjectURL(file);
          const img = new window.Image() as HTMLImageElement;
          img.onload = () => {
            const maxW = 480;
            const ratio = Math.min(1, maxW / img.naturalWidth);
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
              draggable: useToolStore.getState().activeTool === "pointer",
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
            });
            layer.add(node);
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
            fill: "#1e1e2e",
            stroke: "#6b6b8a",
            strokeWidth: 1.5,
            cornerRadius: 8,
            name: "selectable",
            draggable: useToolStore.getState().activeTool === "pointer",
          });
          useKonvaNodes.getState().upsert({
            id: rectNodeId,
            canvasX: cx - w / 2 + off,
            canvasY: cy - h / 2 + off,
            canvasW: w,
            canvasH: h,
          });
          layer.add(node);
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
  }, []);

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
        layerRef.current.batchDraw();
      }
    });
  }, []);

  // Switch between pointer (select) mode and pan mode.
  useEffect(() => {
    const stage = stageRef.current;
    const transformer = transformerRef.current;
    const layer = layerRef.current;
    if (!stage || !transformer || !layer) return;

    if (activeTool === "pointer") {
      stage.draggable(false);
      stage.container().style.cursor = "default";
      (stage.find(".selectable") as Konva.Shape[]).forEach((n) => n.draggable(true));
    } else {
      stage.draggable(true);
      stage.container().style.cursor = "default";
      transformer.nodes([]);
      (stage.find(".selectable") as Konva.Shape[]).forEach((n) => n.draggable(false));
      layer.batchDraw();
    }
  }, [activeTool]);

  return (
    <div
      ref={containerRef}
      style={{ position: "fixed", inset: 0, overflow: "hidden" }}
    />
  );
}

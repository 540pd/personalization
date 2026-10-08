// Places dropped/picked files on the canvas.
//
// Triggered by a `canvas:upload` CustomEvent from FloatingDock rather than by
// stage state, which is why it lifts out of Board cleanly: it needs a layer
// and a few callbacks, and nothing else.

import Konva from "konva";
import { useToolStore } from "@/store/tool.store";
import { useViewport } from "@/store/viewport.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useLayerOrder } from "@/store/layerOrder.store";
import { COLORS, DEFAULT_NODE_MAX_EDGE, NODE_CORNER_RADIUS } from "@/constants/canvas.constants";
import { viewportCentre } from "@/lib/canvas/coords";
import { canvasArea } from "../canvasArea";

/** "photo-2024.final.png" -> "photo-2024.final". Only the last segment is an extension. */
export function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

/**
 * Fit inside a square box in BOTH directions, never scaling up.
 *
 * Capping only the width let a tall image through at any height: a 1000x3000
 * upload became 480x1440, taller than the viewport. The leading 1 is what
 * stops a small image being blown up and blurred.
 */
export function fitToBox(
  naturalWidth: number,
  naturalHeight: number,
  edge: number = DEFAULT_NODE_MAX_EDGE
): { w: number; h: number } {
  const ratio = Math.min(1, edge / naturalWidth, edge / naturalHeight);
  return { w: naturalWidth * ratio, h: naturalHeight * ratio };
}

export interface UploadDeps {
  layer: Konva.Layer;
  /** Re-applies the "draggable only in pointer mode" rule to new nodes. */
  applyDraggability: () => void;
  /** Publishes geometry to konvaNodes so ports and wires can track the node. */
  syncAllNodeGeometry: () => void;
  /** Commits to the undo timeline. */
  saveSnapshot: () => void;
}

/** Shared by both branches: register, attach, redraw, and make it undoable. */
function placeNode(
  deps: UploadDeps,
  node: Konva.Shape,
  record: Parameters<ReturnType<typeof useKonvaNodes.getState>["upsert"]>[0]
) {
  useKonvaNodes.getState().upsert(record);
  deps.layer.add(node);
  deps.applyDraggability();
  deps.syncAllNodeGeometry();
  deps.layer.batchDraw();
  deps.saveSnapshot();
}

function addImage(deps: UploadDeps, file: File, cx: number, cy: number, off: number) {
  const url = URL.createObjectURL(file);
  const img = new window.Image() as HTMLImageElement;

  img.onload = () => {
    const { w, h } = fitToBox(img.naturalWidth, img.naturalHeight);
    const id = crypto.randomUUID();
    const x = cx - w / 2 + off;
    const y = cy - h / 2 + off;

    const node = new Konva.Image({
      id, image: img, x, y, width: w, height: h,
      name: "selectable",
      cornerRadius: NODE_CORNER_RADIUS,
      // A light hairline, matching the Create Image placeholder. Without an
      // edge, an image dragged over another node is just a colour change
      // where the two meet -- they read as one stitched shape. Light rather
      // than dark because a dark hairline disappears against mid-tone photo
      // content, which is the failing case.
      //
      // Deliberately a stroke and NOT a shadow: shadowBlur on a Konva.Image
      // forces an offscreen blur pass per node per frame. Measured with 10
      // images redrawing every frame, it took the canvas from 60fps to 4.
      stroke: "rgba(255,255,255,0.95)",
      strokeWidth: 1.5,
      strokeScaleEnabled: false,
      // Bounding-rect hit detection, so clicks on transparent PNG areas still
      // register -- Konva defaults to per-pixel alpha for images.
      hitFunc(ctx: Konva.Context, shape: Konva.Shape) {
        ctx.beginPath();
        ctx.rect(0, 0, shape.width(), shape.height());
        ctx.closePath();
        ctx.fillStrokeShape(shape);
      },
    });

    // A data URL so downstream nodes can send it to the backend as a
    // reference; the Konva node holds an HTMLImageElement, which cannot
    // travel over HTTP.
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);

    placeNode(deps, node, {
      id, canvasX: x, canvasY: y, canvasW: w, canvasH: h,
      imageUrl: canvas.toDataURL("image/png"),
      label: stripExtension(file.name),
    });
  };

  img.src = url;
}

/** Video and audio land as a placeholder rect until media nodes exist. */
function addMediaPlaceholder(deps: UploadDeps, file: File, cx: number, cy: number, off: number) {
  const w = 240;
  const h = file.type.startsWith("video/") ? 135 : 64;
  const id = crypto.randomUUID();
  const x = cx - w / 2 + off;
  const y = cy - h / 2 + off;

  const node = new Konva.Rect({
    id, x, y, width: w, height: h,
    fill: COLORS.mediaFill,
    stroke: COLORS.mediaStroke,
    strokeWidth: 1.5,
    cornerRadius: 8,
    name: "selectable",
  });

  placeNode(deps, node, { id, canvasX: x, canvasY: y, canvasW: w, canvasH: h });
}

/** Handler for the `canvas:upload` event. */
export function createUploadHandler(deps: UploadDeps) {
  return (e: Event) => {
    const { files } = (e as CustomEvent<{ files: File[] }>).detail as { files: File[] };

    // Return to pointer so the new node can be moved straight away. Without
    // this an upload under a link/shape tool lands a node that cannot be
    // dragged, and the press pans the board instead.
    useToolStore.getState().setTool("pointer");
    // A just-uploaded image must not land behind an existing panel.
    useLayerOrder.getState().raiseCanvas();

    const { x: sx, y: sy, scale } = useViewport.getState();
    // canvasArea, not the window: the sidebar covers the left edge, so
    // centring on the window drops the image partly behind it.
    const { x: cx, y: cy } = viewportCentre({ x: sx, y: sy, scale }, canvasArea());

    files.forEach((file, i) => {
      const off = i * 24;   // cascade, so a multi-file drop does not stack
      if (file.type.startsWith("image/")) addImage(deps, file, cx, cy, off);
      else addMediaPlaceholder(deps, file, cx, cy, off);
    });
  };
}

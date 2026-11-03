// Places dropped/picked files on the canvas.
//
// Triggered by uploadEvent from FloatingDock rather than by
// stage state, which is why it lifts out of Board cleanly: it needs a layer
// and a few callbacks, and nothing else.

import Konva from "konva";
import { useToolStore } from "@/store/tool.store";
import { useViewport } from "@/store/viewport.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useLayerOrder } from "@/store/layerOrder.store";
import { useUpload } from "@/store/upload.store";
import { COLORS, DEFAULT_NODE_MAX_EDGE, NODE_CORNER_RADIUS } from "@/constants/canvas.constants";
import { toCanvas, viewportCentre, type Point } from "@/lib/canvas/coords";
import { takenLabels, uniqueLabel } from "@/lib/canvas/labels";
import { canvasArea } from "../canvasArea";
import { saveFrameBitmap } from "./frameImageStorage";
import { joinLayout } from "./autoLayoutDrop";
import { canvasEvent } from "@/lib/canvas/events";
import type { BoardLayerDeps } from "./boardContext";
import { uploadNodeFile } from "./uploadAsset";

/**
 * Detail of uploadEvent.
 *
 * `at` is the screen point of a drop. Absent for the file picker, which has
 * no meaningful cursor position and so falls back to the viewport centre.
 */
export interface UploadDetail {
  files: File[];
  at?: Point;
}

/** Files to place on the board: the dock's picker and desktop drops emit it. */
export const uploadEvent = canvasEvent<UploadDetail>("canvas:upload");

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

export type UploadDeps = Pick<BoardLayerDeps, "layer" | "applyDraggability" | "syncAllNodeGeometry" | "saveSnapshot">;

/** Shared by both branches: register, attach, redraw, and make it undoable. */
function placeNode(
  deps: UploadDeps,
  node: Konva.Shape,
  record: Parameters<ReturnType<typeof useKonvaNodes.getState>["upsert"]>[0],
  droppedAt?: Point,
) {
  useKonvaNodes.getState().upsert(record);
  deps.layer.add(node);
  deps.applyDraggability();
  deps.syncAllNodeGeometry();
  // Dropped from the computer onto a Frame with auto layout: it joins the
  // row (#228). A picked file has no drop point and lands as before.
  if (droppedAt) joinLayout(record.id, droppedAt);
  deps.layer.batchDraw();
  deps.saveSnapshot();
}

/**
 * Bounding-rect hit detection for an uploaded image, so clicks on transparent
 * PNG areas still register -- Konva defaults to per-pixel alpha for images.
 * Exported for a board file (#199): a function cannot be saved, so a loaded
 * image gets this one back.
 */
export function imageHitFunc(ctx: Konva.Context, shape: Konva.Shape) {
  ctx.beginPath();
  ctx.rect(0, 0, shape.width(), shape.height());
  ctx.closePath();
  ctx.fillStrokeShape(shape);
}

function addImage(
  deps: UploadDeps,
  file: File,
  cx: number,
  cy: number,
  off: number,
  onSettled: () => void,
  droppedAt?: Point,
) {
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
      hitFunc: imageHitFunc,
    });

    // A data URL so downstream nodes can send it to the backend as a
    // reference; the Konva node holds an HTMLImageElement, which cannot
    // travel over HTTP. Until the upload below is stored, or for good when
    // assets are kept in memory only (local dev).
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);

    const imageUrl = canvas.toDataURL("image/png");
    // Read taken labels here rather than at drop time: onload fires per file
    // and placeNode registers each one synchronously, so uploading two
    // cat.png gives "cat" then "cat (2)" instead of two "cat"s.
    placeNode(deps, node, {
      id, canvasX: x, canvasY: y, canvasW: w, canvasH: h,
      imageUrl,
      label: uniqueLabel(stripExtension(file.name), takenLabels()),
    }, droppedAt);
    URL.revokeObjectURL(url);
    onSettled();
    // The image must land even when IndexedDB is slow, blocked or disabled.
    // Storage serializes writes/deletes per id so a delete during this write
    // cannot leave an orphan bitmap behind.
    void saveFrameBitmap(id, imageUrl).catch((err) => {
      console.warn("[frames] Could not save uploaded image for reload.", err);
    });
    // On the board already, with its local copy; now into the user's
    // stored assets, the original rather than the downscaled copy (#323).
    void uploadNodeFile(id, file);
  };

  // Without this a file the browser cannot decode never settles, and anything
  // waiting on the upload -- the dock's busy state -- waits forever. A broken
  // file drops out silently rather than taking the rest of the pick with it.
  img.onerror = () => {
    URL.revokeObjectURL(url);
    onSettled();
  };

  img.src = url;
}

/** Video and audio land as a placeholder rect until media nodes exist. */
function addMediaPlaceholder(deps: UploadDeps, file: File, cx: number, cy: number, off: number, droppedAt?: Point) {
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

  placeNode(deps, node, { id, canvasX: x, canvasY: y, canvasW: w, canvasH: h }, droppedAt);
}

/** Handler for uploadEvent. */
export function createUploadHandler(deps: UploadDeps) {
  return ({ files, at }: UploadDetail) => {

    // Return to pointer so the new node can be moved straight away. Without
    // this an upload under a link/shape tool lands a node that cannot be
    // dragged, and the press pans the board instead.
    useToolStore.getState().setTool("pointer");
    // A just-uploaded image must not land behind an existing panel.
    useLayerOrder.getState().raiseCanvas();

    const { x: sx, y: sy, scale } = useViewport.getState();
    const vp = { x: sx, y: sy, scale };
    // A drop lands where it was dropped; a picked file has no cursor to speak
    // of and goes to the centre. canvasArea, not the window: the sidebar
    // covers the left edge, so centring on the window drops the image partly
    // behind it.
    const { x: cx, y: cy } = at ? toCanvas(at, vp) : viewportCentre(vp, canvasArea());
    // Only a drop has a point to join an auto layout row at (#228).
    const droppedAt = at ? { x: cx, y: cy } : undefined;

    // Images decode asynchronously, so the pick is not done when this
    // function returns. Count them down instead: the dock stays lit until the
    // last file lands, not the first.
    let pending = files.length;
    const settle = () => {
      pending -= 1;
      if (pending <= 0) useUpload.getState().setUploading(false);
    };

    files.forEach((file, i) => {
      const off = i * 24;   // cascade, so a multi-file drop does not stack
      if (file.type.startsWith("image/")) {
        addImage(deps, file, cx, cy, off, settle, droppedAt);
      } else {
        addMediaPlaceholder(deps, file, cx, cy, off, droppedAt);
        settle();   // synchronous: already on the canvas
      }
    });
  };
}

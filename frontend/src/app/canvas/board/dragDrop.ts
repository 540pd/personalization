// Drag-and-drop file uploads onto the canvas.
//
// The browser's default action for a dropped file is to NAVIGATE to it, which
// replaces the board with the raw image and loses unsaved work (#38). That
// default has to be cancelled on BOTH dragover and drop, and cancelling it
// only over the Konva container is not enough: a drop that lands on the
// sidebar, the dock or a panel still navigates. So the suppression is
// window-wide and the *placement* is what checks the canvas.
//
// Drops reuse uploadEvent rather than calling into the upload
// module directly, so the file-picker path and this one cannot drift apart --
// they are the same code from here on.

import type { Point, Rect } from "@/lib/canvas/coords";

/** What the file picker accepts, kept in step with FloatingDock's `accept`. */
const ACCEPTED_PREFIXES = ["image/", "video/", "audio/"];

export function isAcceptedFile(file: File): boolean {
  return ACCEPTED_PREFIXES.some((p) => file.type.startsWith(p));
}

/**
 * Files only. Dragging a node inside the board, or selected text, also fires
 * these events; treating those as an upload would flash the drop affordance
 * over every internal drag.
 */
export function isFileDrag(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  // `types` is a frozen array-like in some browsers, hence the spread.
  return [...dt.types].includes("Files");
}

/**
 * Is this screen point over the visible canvas?
 *
 * The Konva container is `position: fixed; inset: 0`, so it sits UNDER the
 * sidebar rather than beside it -- hit-testing the container would accept a
 * drop onto the rail, which then lands a node the user cannot see. canvasArea
 * is the one place that knows the difference.
 */
export function isOverCanvas(pt: Point, area: Rect): boolean {
  const left = area.left ?? 0;
  const top = area.top ?? 0;
  return (
    pt.x >= left &&
    pt.x <= left + area.width &&
    pt.y >= top &&
    pt.y <= top + area.height
  );
}

export interface DragDropDeps {
  /** The visible canvas region, read per event so a sidebar toggle is picked up. */
  area: () => Rect;
  /** Accepted files, plus the screen point they were dropped at. */
  onDrop: (files: File[], at: Point) => void;
  /** Drives the drop affordance. Called only on a real change. */
  setActive: (active: boolean) => void;
}

export function createDragDropHandlers(deps: DragDropDeps) {
  // dragenter/dragleave fire for every element the cursor crosses, so a bare
  // boolean flickers off the moment the pointer moves between two nodes. The
  // counter only reaches 0 when the drag has genuinely left the window.
  let depth = 0;
  let active = false;

  const setActive = (next: boolean) => {
    if (next === active) return;
    active = next;
    deps.setActive(next);
  };

  const reset = () => {
    depth = 0;
    setActive(false);
  };

  const dragEnter = (e: DragEvent) => {
    if (!isFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    depth += 1;
    setActive(isOverCanvas({ x: e.clientX, y: e.clientY }, deps.area()));
  };

  const dragOver = (e: DragEvent) => {
    if (!isFileDrag(e.dataTransfer)) return;
    // The one that actually suppresses navigation: without preventDefault on
    // dragover the drop event never fires at all and the browser takes over.
    e.preventDefault();
    if (e.dataTransfer) {
      // "copy" so the cursor reads as adding to the board rather than moving.
      e.dataTransfer.dropEffect = isOverCanvas({ x: e.clientX, y: e.clientY }, deps.area())
        ? "copy"
        : "none";
    }
    setActive(isOverCanvas({ x: e.clientX, y: e.clientY }, deps.area()));
  };

  const dragLeave = (e: DragEvent) => {
    if (!isFileDrag(e.dataTransfer)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) setActive(false);
  };

  const drop = (e: DragEvent) => {
    if (!isFileDrag(e.dataTransfer)) return;
    // Cancel the navigation even when the drop misses the canvas -- landing on
    // the sidebar must not replace the board with the image either.
    e.preventDefault();
    reset();

    const at = { x: e.clientX, y: e.clientY };
    if (!isOverCanvas(at, deps.area())) return;

    const files = [...(e.dataTransfer?.files ?? [])].filter(isAcceptedFile);
    if (!files.length) return;

    deps.onDrop(files, at);
  };

  return { dragEnter, dragOver, dragLeave, drop, reset };
}

// Keeping the whole board across reloads (#203).
//
// Panels already persist themselves (nodePanel.store, "gcos-node-panels"),
// and the e2e suite reads and seeds that key, so they are left exactly as
// they are. Everything else -- Konva nodes, frames, wires, which layer paints
// on top -- is saved here, beside them, in the board file format (#198) minus
// its panels, and read back through the same parser Open file uses (#199).
//
// A change only marks the board dirty. The snapshot is built once changes
// settle, or at once when the page is hidden or unloaded: a drag publishes
// geometry on every pointermove, and building a snapshot there would bring
// back the trailing drag #155 fixed.

import type Konva from "konva";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useNodePanel, SAVE_DELAY_MS } from "@/store/nodePanel.store";
import { useConnectionStore } from "@/store/connection.store";
import { useFrames } from "@/store/frame.store";
import { useLayerOrder } from "@/store/layerOrder.store";
import { canvasHistory } from "@/lib/canvas/history";
import { parseBoardFile, serializeBoard, type BoardFile } from "./boardFile";

export const CANVAS_STORAGE_KEY = "gcos-board-canvas";

/** What is stored: a board file without its panels, which persist on their own. */
type SavedCanvas = Omit<BoardFile, "panels">;

let warned = false;
function warnOnce(message: string) {
  if (warned) return;
  warned = true;
  console.warn(`[board] ${message}`);
}

/**
 * Writes the canvas half of the board. Over quota -- uploaded images are data
 * URLs and share localStorage with the panels' generated ones -- it retries
 * without the pictures, so every position, text and wire still survives; the
 * images themselves do not come back. Never throws: the board in memory is
 * unaffected whatever happens here.
 */
export function writeCanvas(container: Konva.Container, storage: Storage = window.localStorage): void {
  const { panels: _panels, ...canvas } = serializeBoard(container);
  try {
    storage.setItem(CANVAS_STORAGE_KEY, JSON.stringify(canvas));
    return;
  } catch {
    // Fall through to the lean save.
  }
  try {
    const lean: SavedCanvas = {
      ...canvas,
      nodes: canvas.nodes.map(({ imageUrl: _image, ...rest }) => rest),
    };
    storage.setItem(CANVAS_STORAGE_KEY, JSON.stringify(lean));
    warnOnce("Uploaded images are too large to keep across a reload; everything else on the board is saved without them.");
  } catch {
    warnOnce("The board could not be saved. It is unaffected until the page reloads.");
  }
}

/**
 * The saved board, panels included, checked like an opened file. Null when
 * nothing is saved or what is saved cannot be used -- then the board starts
 * with just its panels, and the bad entry is left alone for the next save to
 * replace rather than deleted.
 */
export function readSavedCanvas(storage: Storage = window.localStorage): BoardFile | null {
  let text: string | null;
  try {
    text = storage.getItem(CANVAS_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!text) return null;
  let saved: unknown;
  try {
    saved = JSON.parse(text);
  } catch {
    console.warn("[board] The saved board is unreadable and was not restored.");
    return null;
  }
  // The panels are added so wires to them pass the parser's both-ends check.
  const panels = useNodePanel
    .getState()
    .panels.map(({ isActive: _a, isPanelOpen: _o, job: _j, ...rest }) => rest);
  const parsed = parseBoardFile(JSON.stringify({ ...(saved as object), panels }));
  if (!parsed.ok) {
    console.warn(
      parsed.error === "newer"
        ? "[board] The saved board is from a newer version of PlaySpace and was not restored."
        : "[board] The saved board is unreadable and was not restored.",
    );
    return null;
  }
  return parsed.file;
}

/**
 * Saves the board whenever it changes, until the returned function is called
 * -- which also writes anything still pending. `getContainer` is read at save
 * time, so a save never runs against a stage that has gone.
 */
export function startCanvasPersistence(
  getContainer: () => Konva.Container | null,
  delay = SAVE_DELAY_MS,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!dirty) return;
    const container = getContainer();
    if (!container) return;
    dirty = false;
    writeCanvas(container);
  };

  const markDirty = () => {
    dirty = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, delay);
  };

  const onHidden = () => {
    if (document.visibilityState === "hidden") flush();
  };

  // History catches what changes only on the Konva node -- a recolour, a
  // text edit, a z-order -- and every undo and redo. The stores catch what
  // never becomes an undo step: a rename, a wire added or removed.
  const unsubscribe = [
    canvasHistory.subscribe(markDirty),
    useKonvaNodes.subscribe(markDirty),
    useFrames.subscribe((s, prev) => {
      if (s.frames !== prev.frames) markDirty();
    }),
    useConnectionStore.subscribe((s, prev) => {
      if (s.connections !== prev.connections) markDirty();
    }),
    useLayerOrder.subscribe((s, prev) => {
      if (s.topLayer !== prev.topLayer) markDirty();
    }),
  ];
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", onHidden);

  return () => {
    flush();
    unsubscribe.forEach((u) => u());
    window.removeEventListener("pagehide", flush);
    document.removeEventListener("visibilitychange", onHidden);
  };
}

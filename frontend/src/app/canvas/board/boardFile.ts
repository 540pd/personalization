// Save to file (#198) and Open file (#199): the flows around a board file. The
// format itself is boardFileFormat; reading one back is boardFileRead. Both
// are re-exported here, so a caller imports a board file's whole API from
// this module.

import type Konva from "konva";
import { useNodePanel } from "@/store/nodePanel.store";
import { useConnectionStore } from "@/store/connection.store";
import { useFrames } from "@/store/frame.store";
import { useLayerOrder } from "@/store/layerOrder.store";
import { useViewport } from "@/store/viewport.store";
import { boardStage } from "@/lib/canvas/boardStage";
import { boundsOf } from "@/lib/canvas/bounds";
import { downloadText } from "@/lib/dom/download";
import { canvasEvent } from "@/lib/canvas/events";
import { canvasArea } from "../canvasArea";
import { fitTo } from "../components/Minimap/zoom";
import { unionBounds } from "../components/Minimap/world";
import { currentBounds } from "../components/Minimap/boardBounds";
import { nodeEntry } from "./nodeEntry";
import {
  BOARD_FILE_FORMAT,
  BOARD_FILE_VERSION,
  plainAttrs,
  toFilePanel,
  type BoardFile,
  type BoardFileNode,
} from "./boardFileFormat";

export * from "./boardFileFormat";
export * from "./boardFileRead";

/**
 * The board in `container` plus the stores, as a file. A container rather
 * than the stage so a test can pass a Konva.Group: jsdom has no Stage.
 */
export function serializeBoard(container: Konva.Container, now = new Date()): BoardFile {
  // find() returns ascending z, so this array is already the paint order.
  const nodes = (container.find(".selectable") as Konva.Shape[]).map(
    (n): BoardFileNode => nodeEntry(n, plainAttrs(n.getAttrs())),
  );
  const panels = useNodePanel.getState().panels.map(toFilePanel);
  return {
    format: BOARD_FILE_FORMAT,
    version: BOARD_FILE_VERSION,
    savedAt: now.toISOString(),
    panels,
    nodes,
    frames: Object.values(useFrames.getState().frames),
    connections: useConnectionStore.getState().connections,
    topLayer: useLayerOrder.getState().topLayer,
  };
}

/** `PlaySpace 2026-10-18.json`, by the local date: what the user sees on their calendar. */
export function boardFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `PlaySpace ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

/**
 * Downloads the board. Returns false if the file could not be made, having
 * logged why; nothing is downloaded then, so there is never a partial file.
 */
export function saveBoardToFile(): boolean {
  try {
    const stage = boardStage.current;
    if (!stage) throw new Error("the board stage is not mounted");
    const now = new Date();
    const json = JSON.stringify(serializeBoard(stage, now));
    downloadText(boardFileName(now), json, "application/json");
    return true;
  } catch (err) {
    console.error("[board] Could not save the board to a file:", err);
    return false;
  }
}

// ── Open file (#199) ──────────────────────────────────────────────────────

/** Board listens; Open file emits it with a parsed file. */
export const loadBoardEvent = canvasEvent<BoardFile>("canvas:load");

export function requestLoadBoard(file: BoardFile): void {
  loadBoardEvent.emit(file);
}

/**
 * "Zoom to fit" after a load, frames included. The dock's Zoom to fit
 * measures nodes and panels only; here that would zoom in past a loaded
 * frame and leave it off screen, as if it had not come back.
 */
export function zoomToFitBoard(): void {
  const frames = Object.values(useFrames.getState().frames).map(boundsOf);
  const box = unionBounds([...currentBounds(), ...frames]);
  if (box) useViewport.setState(fitTo(box, canvasArea()));
}

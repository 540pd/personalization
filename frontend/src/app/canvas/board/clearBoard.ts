// Clear board (#197): one event from the Playspace options, handled by Board.
//
// An event rather than a store action because the Konva nodes are not in a
// store: they live on Board's layer, and only Board holds the layer and the
// transformer. Same move as uploadEvent and colorEvent.

import { useNodePanel } from "@/store/nodePanel.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useFrames } from "@/store/frame.store";
import { canvasEvent } from "@/lib/canvas/events";

/** Board listens; the Clear board confirm emits it. */
export const clearBoardEvent = canvasEvent("canvas:clear");

export function requestClearBoard(): void {
  clearBoardEvent.emit();
}

/**
 * What Clear would remove, as the user counts it: panels, Konva nodes
 * (shapes, text, lines, uploaded images) and frames. Wires are left out --
 * they go with the nodes they join, and nobody thinks of one as an item.
 */
export function useBoardItemCount(): number {
  const panels = useNodePanel((s) => s.panels.length);
  const nodes = useKonvaNodes((s) => Object.keys(s.nodes).length);
  const frames = useFrames((s) => Object.keys(s.frames).length);
  return panels + nodes + frames;
}

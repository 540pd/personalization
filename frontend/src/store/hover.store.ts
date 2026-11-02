import { useEffect } from "react";
import { create } from "zustand";
import { useNodePanel } from "@/store/nodePanel.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useFrames } from "@/store/frame.store";
import { useLayerOrder } from "@/store/layerOrder.store";
import { useViewport } from "@/store/viewport.store";
import { hoverTargetAt, type HoverCandidate } from "@/lib/canvas/hoverTarget";
import { disposeAll, listen } from "@/lib/dom/listen";

/**
 * The node under the pointer, by id -- a panel, an image or shape, or a
 * frame -- for "Always show node names" off (#215).
 *
 * Tracked only while something needs it: the window listener is installed
 * by the first useHoveredNode(true) and removed with the last, so a board
 * with names always on pays nothing per pointer move. The state changes
 * only when the hovered id does, so the labels re-render on enter and leave,
 * not on every move.
 */
interface HoverState {
  hoveredId: string | null;
}

export const useHover = create<HoverState>(() => ({ hoveredId: null }));

/** Every node on the board as a hover candidate; also where a dragged wire is dropped (#458). */
export function boardCandidates(): HoverCandidate[] {
  const panels = useNodePanel.getState().panels;
  const nodes = Object.values(useKonvaNodes.getState().nodes);
  const frames = Object.values(useFrames.getState().frames);
  return [
    ...frames.map((f, i): HoverCandidate => ({ id: f.id, box: f, layer: "frame", order: i })),
    ...nodes.map((n): HoverCandidate => ({ id: n.id, box: n, layer: "canvas", order: n.z ?? 0 })),
    ...panels.map((p, i): HoverCandidate => ({ id: p.id, box: p, layer: "dom", order: i })),
  ];
}

function onMove(e: PointerEvent) {
  const { x, y, scale } = useViewport.getState();
  const point = { x: (e.clientX - x) / scale, y: (e.clientY - y) / scale };
  const id = hoverTargetAt(point, boardCandidates(), scale, useLayerOrder.getState().topLayer);
  if (id !== useHover.getState().hoveredId) useHover.setState({ hoveredId: id });
}

function onLeave() {
  if (useHover.getState().hoveredId !== null) useHover.setState({ hoveredId: null });
}

let users = 0;
const off: Array<() => void> = [];

function track() {
  if (users++ === 0) {
    off.push(listen(window, "pointermove", onMove), listen(document.documentElement, "pointerleave", onLeave));
  }
  return () => {
    if (--users === 0) {
      disposeAll(off);
      onLeave();
    }
  };
}

/** The hovered node's id while `enabled`; null (and no tracking) otherwise. */
export function useHoveredNode(enabled: boolean): string | null {
  useEffect(() => (enabled ? track() : undefined), [enabled]);
  const hoveredId = useHover((s) => s.hoveredId);
  return enabled ? hoveredId : null;
}

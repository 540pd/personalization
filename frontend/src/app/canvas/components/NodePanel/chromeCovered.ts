import type { PanelInstance } from "@/store/nodePanel.store";
import type { KonvaNodeRecord } from "@/store/konvaNodes.store";
import { isCovered, konvaBlocker, labelProbe, portProbe, type Blocker, type TopLayer } from "@/lib/canvas/occlusion";

// Occlusion lives in lib/canvas/occlusion. Panels share one z-index, so array
// order IS paint order: only panels later in the array can cover this one.
// Each port is tested separately — a neighbour overlapping the left edge must
// hide the input port without blanking the output.
// The name is tested here too, off the same blocker list: it is no longer
// selection chrome, so a covered name has to hide for the reason a covered
// port does -- drawn over the node that covers it, it reads as that node's.
export function chromeCovered(
  p: PanelInstance,
  above: PanelInstance[],
  konvaNodes: KonvaNodeRecord[],
  topLayer: TopLayer,
  scale: number
): { input: boolean; output: boolean; label: boolean } {
  const self: Blocker = { id: p.id, box: p, layer: "dom" };
  const blockers: Blocker[] = [
    ...above.map((q): Blocker => ({ id: q.id, box: q, layer: "dom" })),
    // Uploaded images only block when the canvas is the front layer; drawn
    // shapes never do (#430).
    ...konvaNodes.map(konvaBlocker),
  ];
  return {
    input:  isCovered(portProbe(p, "input", scale), self, blockers, topLayer),
    output: isCovered(portProbe(p, "output", scale), self, blockers, topLayer),
    label:  isCovered(labelProbe(p, scale), self, blockers, topLayer),
  };
}

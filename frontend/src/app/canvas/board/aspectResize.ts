// A Create node changing size because a setting changed (aspect ratio).
//
// Two rules (#129):
//   - The top-left corner stays put and the node grows right and down. It
//     used to grow around its vertical centre, so a variant in a grid grew up
//     over the node above it and hid that node's name.
//   - A node that was inside a Frame is still inside it afterwards: the Frame
//     grows to fit. Membership is decided by full containment when a Frame is
//     dragged (frameMembers.ts), so a node poking out of its Frame would
//     silently be left behind by the next drag.

import { useNodePanel } from "@/store/nodePanel.store";
import { useFrames } from "@/store/frame.store";
import { boundsOf, containsBox, type Bounds } from "@/lib/canvas/bounds";
import { VARIANT_PADDING } from "./variants";

/**
 * `frame` grown just enough to hold `box` with `pad` of margin on each side it
 * overflowed, or null if `box` already fits.
 *
 * Only the overflowing sides move. Re-padding every side would shift a Frame
 * the user drew by hand on a side the node never touched.
 */
export function grownToFit(frame: Bounds, box: Bounds, pad: number = VARIANT_PADDING): Bounds | null {
  if (containsBox(frame, box)) return null;
  let left = frame.x;
  let top = frame.y;
  let right = frame.x + frame.w;
  let bottom = frame.y + frame.h;
  if (box.x < left) left = box.x - pad;
  if (box.y < top) top = box.y - pad;
  if (box.x + box.w > right) right = box.x + box.w + pad;
  if (box.y + box.h > bottom) bottom = box.y + box.h + pad;
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * Resize a Create node to `w` x `h`, keeping its top-left fixed and growing
 * any Frame that held it. The caller commits, so the settings change that
 * caused this and the resize are one undo step.
 *
 * Returns false, and changes nothing, when the node is already that size.
 */
export function resizeNodeForSettings(id: string, w: number, h: number): boolean {
  const store = useNodePanel.getState();
  const panel = store.panels.find((p) => p.id === id);
  if (!panel || (panel.w === w && panel.h === h)) return false;

  const before = boundsOf(panel);
  const after: Bounds = { x: before.x, y: before.y, w, h };
  // Decided before the resize: "was it inside", not "is it inside".
  const hosts = Object.values(useFrames.getState().frames).filter((f) =>
    containsBox(boundsOf(f), before)
  );

  store.setSize(id, w, h);
  // canvasY is the node's vertical centre; keep the top where it was.
  store.setCanvasPos(id, panel.canvasX, before.y + h / 2);

  for (const f of hosts) {
    const grown = grownToFit(boundsOf(f), after);
    if (grown) {
      useFrames.getState().upsert({
        ...f, canvasX: grown.x, canvasY: grown.y, canvasW: grown.w, canvasH: grown.h,
      });
    }
  }

  return true;
}

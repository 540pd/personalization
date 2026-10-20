// A drag that DOM chrome around the selection should step aside for.
//
// Konva drags and transforms announce themselves on the stage. A line's end
// and bend handles are DOM (LineHandles), so they announce theirs here, for
// the style bar to hide behind (#162).

import { canvasEvent } from "@/lib/canvas/events";

export interface GestureDetail {
  active: boolean;
}

export const gestureEvent = canvasEvent<GestureDetail>("canvas:gesture");

export function announceGesture(active: boolean): void {
  gestureEvent.emit({ active });
}

// A drag that DOM chrome around the selection should step aside for.
//
// Konva drags and transforms announce themselves on the stage. A line's end
// and bend handles are DOM (LineHandles), so they announce theirs here, for
// the style bar to hide behind (#162).

export const GESTURE_EVENT = "canvas:gesture";

export interface GestureDetail {
  active: boolean;
}

export function announceGesture(active: boolean): void {
  window.dispatchEvent(new CustomEvent<GestureDetail>(GESTURE_EVENT, { detail: { active } }));
}

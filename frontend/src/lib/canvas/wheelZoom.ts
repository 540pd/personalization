// Wheel → zoom toward the cursor. Shared by Board's stage and the frames stage (#142).

import type Konva from "konva";
import { useViewport } from "@/store/viewport.store";

export function bindWheelZoom(stage: Konva.Stage): void {
  stage.on("wheel", (e) => {
    e.evt.preventDefault();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    useViewport.getState().zoomToPoint(e.evt.deltaY, pointer.x, pointer.y);
  });
}

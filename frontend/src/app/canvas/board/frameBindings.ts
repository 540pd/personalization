// What Frames join for as long as the board is up, stage or no stage.

import { useFrames } from "@/store/frame.store";
import { canvasHistory } from "@/lib/canvas/history";
import { disposeAll } from "@/lib/dom/listen";
import { startAutoLayoutSync } from "./autoLayout";
import { colorEvent } from "./palette";

/** The undo adapter, the auto-layout sync and colour picks. Returns one disposer. */
export function bindFrames(): () => void {
  const off = [
    // An adapter rather than a private stack: history.ts exists because two
    // competing stacks made Ctrl+Z non-chronological across node kinds.
    canvasHistory.register("frames", {
      capture: () => ({ ...useFrames.getState().frames }),
      restore: (snap) =>
        useFrames.getState().replaceAll({ ...(snap as Record<string, never>) }),
    }),

    // Auto layout (#225): lay rows out again after every change.
    startAutoLayoutSync(),

    // A swatch picked in the dock recolours the selected frames' outlines.
    // Outline only (#159): the fill stays the quiet backdrop #115 made it.
    // Committed with the event as its key, so shapes and text recoloured by
    // the same pick (Board) share the one undo step.
    colorEvent.on(({ hex }, e) => {
      const { frames, selectedIds, upsert } = useFrames.getState();
      const changed = selectedIds.filter((id) => frames[id] && frames[id].stroke !== hex);
      if (!changed.length) return;
      changed.forEach((id) => upsert({ ...frames[id], stroke: hex }));
      canvasHistory.commit(e);
    }),
  ];
  return () => disposeAll(off);
}

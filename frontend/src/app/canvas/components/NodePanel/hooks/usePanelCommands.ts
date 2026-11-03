"use client";

// What the Create nodes add to the board's commands (#468, moved out of
// NodePanel): their slice of the undo timeline, and Delete and Escape for
// the selected ones. Mirrors Connections/useWireCommands (#466).

import { useEffect } from "react";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { canvasHistory } from "@/lib/canvas/history";
import { boardKeyAllowed } from "@/lib/canvas/boardKeys";
import { listen } from "@/lib/dom/listen";
import { kindSpec } from "../kinds";

export function usePanelCommands() {
  // The panels half of the shared undo timeline. Every store setter rebuilds
  // the objects it touches, so holding the array is a valid snapshot --
  // nothing mutates a PanelInstance in place.
  useEffect(() => {
    return canvasHistory.register("panels", {
      capture: () => useNodePanel.getState().panels,
      restore: (snap) =>
        useNodePanel.getState().replaceAll(snap as PanelInstance[], (p) => !!kindSpec(p.kind).authored),
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Not while another page covers the board (#206), nor from a field.
      // Capture phase runs before a modal can stop the event, so this has to
      // opt out itself: Backspace on a popup's button must not delete here.
      if (!boardKeyAllowed(e)) return;
      const store = useNodePanel.getState();

      // No undo/redo here. There is one timeline and Board owns the only
      // listener; this used to run in capture phase and
      // stopImmediatePropagation its way to priority, which is what made
      // Ctrl+Z non-chronological across node kinds.

      // Delete / Backspace — remove every selected placeholder; after Ctrl+A
      // that is many.
      if ((e.code === "Delete" || e.code === "Backspace") && store.selectedIds.length) {
        e.preventDefault();
        store.removeSelected();
        // Keyed on the event: wires and images deleted by the same keypress
        // land in this one undo step.
        canvasHistory.commit(e);
        return;
      }
      // Escape — collapse all panels, keep placeholders.
      if (e.code === "Escape") store.clearSelection();
    };
    // Capture phase ensures this runs before Board.tsx's bubble-phase listener.
    return listen(window, "keydown", handler, { capture: true });
  }, []);
}

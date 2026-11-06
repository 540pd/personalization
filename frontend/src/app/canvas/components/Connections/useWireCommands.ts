"use client";

// What the wires add to the board's commands (#466): their slice of the
// undo timeline, and Delete for the selected ones.

import { useEffect } from "react";
import { useConnectionStore, type Connection } from "@/store/connection.store";
import { canvasHistory } from "@/lib/canvas/history";
import { boardKeyAllowed } from "@/lib/canvas/boardKeys";
import { listen } from "@/lib/dom/listen";

export function useWireCommands() {
  // The wires slice of the shared undo timeline, so undoing a delete brings
  // back the wires along with the nodes they joined. Every store setter
  // builds a new array, so holding it is a valid snapshot.
  useEffect(() => {
    return canvasHistory.register("connections", {
      capture: () => useConnectionStore.getState().connections,
      restore: (snap) => useConnectionStore.getState().replaceConnections(snap as Connection[]),
    });
  }, []);

  // Delete key removes all selected connections.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Capture phase runs before a modal can stop the event, so the guard
      // has to skip a dialog's keys itself; see NodePanel.
      if (!boardKeyAllowed(e)) return;
      if (e.code !== "Delete" && e.code !== "Backspace") return;
      const { selectedIds } = useConnectionStore.getState();
      if (!selectedIds.length) return;
      e.preventDefault();
      // No stopImmediatePropagation: when nodes are selected alongside the
      // wires (Ctrl+A, Ctrl+click), their Delete handlers must run too.
      selectedIds.forEach((id) => useConnectionStore.getState().removeConnection(id));
      canvasHistory.commit(e);
    };
    return listen(window, "keydown", handler, { capture: true });
  }, []);
}

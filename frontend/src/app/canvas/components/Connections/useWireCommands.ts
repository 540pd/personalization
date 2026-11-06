"use client";

// What the wires add to the board's commands (#466): their slice of the
// undo timeline, and their part of the board's one Delete (#472).

import { useEffect } from "react";
import { useConnectionStore, type Connection } from "@/store/connection.store";
import { canvasHistory } from "@/lib/canvas/history";
import { registerDeletable } from "@/lib/canvas/boardDelete";

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

  // Delete / Backspace removes every selected wire, as the wires' part of
  // the board's one Delete (#472), which commits once with whatever else the
  // same keypress deleted.
  useEffect(
    () =>
      registerDeletable("wires", {
        hasSelection: () => useConnectionStore.getState().selectedIds.length > 0,
        deleteSelected: () => {
          const { selectedIds, removeConnection } = useConnectionStore.getState();
          selectedIds.forEach((id) => removeConnection(id));
        },
      }),
    [],
  );
}

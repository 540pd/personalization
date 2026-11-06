"use client";

// A wire being dragged from an output, or picked up by its end (#458): the
// window's pointer and Escape while it lasts, and the cursor while it is
// refused (#460). Moved out of ConnectionOverlay (#466).

import { useEffect, useRef } from "react";
import { useConnectionStore, type DragState } from "@/store/connection.store";
import { canvasHistory } from "@/lib/canvas/history";
import { dropTarget, wireAt, type WireScene } from "@/lib/canvas/wireTargets";
import { trackPointer } from "@/lib/dom/pointer";
import { listen } from "@/lib/dom/listen";

export function useWireDrag(scene: WireScene, drag: DragState | null) {
  // Always fresh, so pointer handlers never see stale data.
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  // Whether the pointer has left the source since the press (#460).
  const leftSource = useRef(false);

  // Global pointer listeners, registered only while a drag is active.
  useEffect(() => {
    if (!drag) return;
    leftSource.current = false;

    const onMove = (e: PointerEvent) => {
      const store = useConnectionStore.getState();
      store.updateDrag(e.clientX, e.clientY);
      const current = store.drag;
      if (!current) return;
      const step = wireAt(sceneRef.current, current, { x: e.clientX, y: e.clientY }, leftSource.current);
      leftSource.current = step.leftSource;
      store.setBlocked(step.blocked);
      store.setLanding(step.landing?.nodeId);
    };

    const onUp = (e: PointerEvent) => {
      const store = useConnectionStore.getState();
      // Escape already ended it.
      if (!store.drag) return;
      const before = store.connections;
      const target = dropTarget(sceneRef.current, store.drag, { x: e.clientX, y: e.clientY });
      if (target) store.commitConnection(target.nodeId);
      // Over nothing, or a node that can't take it (#460): a new wire is
      // dropped, a moved one removed (#458).
      else store.dropNowhere();
      // Duplicates, self-links and a wire put back where it was change nothing.
      if (useConnectionStore.getState().connections !== before) canvasHistory.commit();
    };

    // Escape lets go of the wire without a change (#458). Capture phase, and
    // stopped there, so it doesn't also close a panel.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      useConnectionStore.getState().cancelDrag();
    };
    const offKey = listen(window, "keydown", onKey, { capture: true });

    // A cancelled drag drops the wire: it used to stay on the pointer.
    const offPointer = trackPointer({ onMove, onUp, onCancel: () => useConnectionStore.getState().cancelDrag() });
    return () => {
      offKey();
      offPointer();
    };
  // Re-register only when a new drag starts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag ? `${drag.fromNodeId}:${drag.movingId ?? ""}` : null]);

  // The pointer shows it can't drop here (#460). On the root, so whatever
  // the pointer is over, its own cursor doesn't win.
  const blocked = drag?.blocked;
  useEffect(() => {
    if (!blocked) return;
    document.documentElement.classList.add("wire-blocked");
    return () => document.documentElement.classList.remove("wire-blocked");
  }, [blocked]);
}

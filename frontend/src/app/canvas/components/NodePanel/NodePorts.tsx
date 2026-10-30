"use client";

import type { PanelInstance } from "@/store/nodePanel.store";
import { useConnectionStore } from "@/store/connection.store";
import { Z_INDEX } from "@/constants/canvas.constants";
import { inputPoint, outputPoint } from "@/lib/canvas/ports";
import { toScreen, type Viewport } from "@/lib/canvas/coords";
import "../Connections.scss";

interface NodePortsProps {
  instance: PanelInstance;
  vp: Viewport;
  showInput: boolean;
  showOutput: boolean;
}

/** A node's input and output ports, placed from shared geometry, same as uploaded images. */
export default function NodePorts({ instance, vp, showInput, showOutput }: NodePortsProps) {
  const inPt  = toScreen(inputPoint(instance), vp);
  const outPt = toScreen(outputPoint(instance), vp);
  // A port with a wire on it is drawn filled (#456).
  const inWired  = useConnectionStore((s) => s.connections.some((c) => c.toNodeId === instance.id));
  const outWired = useConnectionStore((s) => s.connections.some((c) => c.fromNodeId === instance.id));
  return (
    <>
      {showInput && (
        <div
          title="Input"
          className={inWired ? "board-port is-input is-connected" : "board-port is-input"}
          style={{ left: inPt.x, top: inPt.y, zIndex: Z_INDEX.ports }}
        >
          <div className="board-port-dot" />
        </div>
      )}

      {/* Absent on a terminal kind, so there is nothing to start a
          connection from. */}
      {showOutput && (
        <div
          title="Output"
          className={outWired ? "board-port is-connected" : "board-port"}
          onPointerDown={(e) => {
            e.stopPropagation();
            useConnectionStore.getState().startDrag(instance.id, "panel", e.clientX, e.clientY);
          }}
          // The wire is this element's pointer gesture. Left to the browser,
          // the same press also starts a text selection that runs to wherever
          // the wire is dropped, highlighting any node text in between (#184).
          onMouseDown={(e) => e.preventDefault()}
          style={{ left: outPt.x, top: outPt.y, zIndex: Z_INDEX.ports }}
        >
          <div className="board-port-dot" />
        </div>
      )}
    </>
  );
}

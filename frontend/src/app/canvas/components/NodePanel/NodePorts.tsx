"use client";

import type { PanelInstance } from "@/store/nodePanel.store";
import { useConnectionStore } from "@/store/connection.store";
import { Z_INDEX } from "@/constants/canvas.constants";
import { inputPoint, outputPoint } from "@/lib/canvas/ports";
import { toScreen, type Viewport } from "@/lib/canvas/coords";
import { wireBlock } from "@/lib/canvas/wires";
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
  // A wire picked up by this end doesn't count while it's in the air (#458).
  const inWired  = useConnectionStore((s) => s.connections.some((c) => c.toNodeId === instance.id && c.id !== s.drag?.movingId));
  const outWired = useConnectionStore((s) => s.connections.some((c) => c.fromNodeId === instance.id));
  // Lit up while a dragged wire could land here (#458).
  const isTarget = useConnectionStore((s) => !!s.drag && wireBlock(instance.id, s.drag, s.connections, true) === null);
  // Red, on the port only, while this is the node under the pointer and
  // can't take the wire (#460).
  const blockedPort = useConnectionStore((s) => (s.drag?.blocked?.nodeId === instance.id ? s.drag.blocked.port : null));
  // The one the wire would land on if let go now stands out (#460).
  const isLanding = useConnectionStore((s) => s.drag?.landingId === instance.id);
  const inClass = [
    "board-port is-input",
    inWired && "is-connected",
    isTarget && "is-target",
    isLanding && "is-landing",
    blockedPort === "input" && "is-blocked",
  ]
    .filter(Boolean)
    .join(" ");
  const outClass = ["board-port", outWired && "is-connected", blockedPort === "output" && "is-blocked"].filter(Boolean).join(" ");
  return (
    <>
      {showInput && (
        <div
          title="Input"
          className={inClass}
          // Pressing a wired input picks up its last wire by that end, to
          // move it or, dropped on nothing, remove it (#458).
          onPointerDown={(e) => {
            const { connections } = useConnectionStore.getState();
            const last = connections.findLast((c) => c.toNodeId === instance.id);
            if (!last) return;
            e.stopPropagation();
            useConnectionStore.getState().startMove(last.id, e.clientX, e.clientY);
          }}
          // As for the output: no text selection from the press (#184).
          onMouseDown={(e) => {
            if (inWired) e.preventDefault();
          }}
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
          className={outClass}
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

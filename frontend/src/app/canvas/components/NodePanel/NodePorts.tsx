"use client";

import type { PanelInstance } from "@/store/nodePanel.store";
import { useConnectionStore } from "@/store/connection.store";
import {
  INPUT_PORT_STYLE,
  OUTPUT_PORT_HIT_STYLE,
  OUTPUT_PORT_STYLE,
  PORT_HIT_PAD,
  PORT_WIDTH,
} from "@/constants/canvas.constants";
import { inputPoint, outputPoint } from "@/lib/canvas/ports";
import { toScreen, type Viewport } from "@/lib/canvas/coords";

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
  return (
    <>
      {showInput && (
        <div
          title="Input"
          style={{
            ...INPUT_PORT_STYLE,
            left: inPt.x,
            top:  inPt.y,
          }}
        />
      )}

      {/* Absent on a terminal kind, so there is nothing to start a
          connection from. */}
      {showOutput && (
        <div
          title="Output"
          onPointerDown={(e) => {
            e.stopPropagation();
            useConnectionStore.getState().startDrag(instance.id, "panel", e.clientX, e.clientY);
          }}
          // The wire is this element's pointer gesture. Left to the browser,
          // the same press also starts a text selection that runs to wherever
          // the wire is dropped, highlighting any node text in between (#184).
          onMouseDown={(e) => e.preventDefault()}
          style={{
            ...OUTPUT_PORT_HIT_STYLE,
            left: outPt.x - PORT_WIDTH - PORT_HIT_PAD,
            top:  outPt.y,
          }}
        >
          <div style={OUTPUT_PORT_STYLE} />
        </div>
      )}
    </>
  );
}

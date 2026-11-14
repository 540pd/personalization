"use client";

// What is drawn around a Create node (#468): its hover outline, selection
// box with resize anchors, name, and ports. Screen px; the node's own body
// is Placeholder.

import type { ComponentProps } from "react";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { useSettings } from "@/store/settings.store";
import { useHoveredNode } from "@/store/hover.store";
import { useConnectionStore } from "@/store/connection.store";
import { LABEL_GAP, LABEL_MIN_NODE_W } from "@/constants/canvas.constants";
import type { Viewport } from "@/lib/canvas/coords";
import NodeLabel from "../NodeLabel";
import { isSource, takesInput } from "./kinds";
import type { ScreenBox } from "./nodeScreenBox";
import HoverOutline from "./HoverOutline";
import SelectionBox from "./SelectionBox";
import NodePorts from "./NodePorts";
import { nodeOutline, nodeState } from "./nodeOutline";

export default function NodeChrome({
  instance, box, vp, hovered, isActive, isPanelOpen, filled, anchors, hideLabel, hideInputPort, hideOutputPort,
}: {
  instance: PanelInstance;
  box: ScreenBox;
  vp: Viewport;
  /** The pointer is over the node's body. */
  hovered: boolean;
  isActive: boolean;
  isPanelOpen: boolean;
  /** The node shows an output. */
  filled: boolean;
  anchors: ComponentProps<typeof SelectionBox>["anchors"];
  hideLabel: boolean;
  hideInputPort: boolean;
  hideOutputPort: boolean;
}) {
  // No hover outline while a wire is dragged: only its ports highlight (#460).
  const wireDragging = useConnectionStore((s) => !!s.drag);
  // Names off (#215): this node's name shows only while hovered or selected.
  // The board-wide hover, not `hovered`: that one ends at the placeholder,
  // and the pointer has to be able to travel up onto the name.
  const alwaysNames = useSettings((s) => s.settings.showNodeNames);
  const hoveredNodeId = useHoveredNode(!alwaysNames);
  // One rule for the outline, the name and the ports (#559).
  const outline = nodeOutline(nodeState(isActive, isPanelOpen), filled);

  return (
    <>
      {/* Suppressed while active, since the selection box below already draws a border. */}
      {hovered && !isActive && !wireDragging && (
        <HoverOutline left={box.left} top={box.top} width={box.width} height={box.height} />
      )}

      {/* ── Transformer border + corner anchors — only in active/panel-open states ── */}
      {isActive && (
        <SelectionBox
          left={box.left}
          top={box.top}
          width={box.width}
          height={box.height}
          outline={outline}
          anchors={isPanelOpen ? undefined : anchors}
        />
      )}

      {/* ── Name — always on, same rules as uploaded images. Hidden when
           covered, except while selected: selecting a buried node and
           getting no name back would defeat the point. ── */}
      {instance.label && box.width >= LABEL_MIN_NODE_W && (!hideLabel || isActive) && (
        <NodeLabel
          value={instance.label}
          left={box.left}
          bottom={box.top - LABEL_GAP}
          maxWidth={box.width}
          colour={outline.linked ? outline.colour : undefined}
          // An unchanged commit (open, then click away) is not a rename, and
          // must not turn an auto name into a user-chosen one.
          onCommit={(next) => {
            if (next !== instance.label) useNodePanel.getState().setLabel(instance.id, next);
          }}
          hidden={!alwaysNames && !isActive && hoveredNodeId !== instance.id}
        />
      )}

      {/* ── Ports — visible unless another panel covers them ── */}
      <NodePorts
        instance={instance}
        vp={vp}
        linked={outline.linked}
        showInput={takesInput(instance.kind) && !hideInputPort}
        showOutput={isSource(instance.kind) && !hideOutputPort}
      />
    </>
  );
}

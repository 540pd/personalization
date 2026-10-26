"use client";

import { NODE_CORNER_RADIUS, Z_INDEX } from "@/constants/canvas.constants";
import type { NodeKindSpec } from "./nodeKinds";

interface ComposeOutputLayerProps {
  spec: NodeKindSpec;
  /** The written text to render. */
  value: string;
  /** Top-left on screen, and the size in canvas units. */
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
  /** The placeholder's drag handlers, so the box still moves from its text. */
  handlers: {
    onPointerDown:   (e: React.PointerEvent) => void;
    onPointerMove:   (e: React.PointerEvent) => void;
    onPointerUp:     (e: React.PointerEvent) => void;
    onPointerCancel: () => void;
  };
  onDoubleClick: () => void;
  onHoverChange: (hovered: boolean) => void;
  onLinkClick: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}

const onLink = (e: React.SyntheticEvent) => !!(e.target as HTMLElement).closest("[data-compose-link]");

/**
 * A written kind's text, rendered as markdown over its box so its links can
 * be clicked. The box still drags and opens the editor from here; a press on
 * a link is the link's, not the start of either.
 */
export default function ComposeOutputLayer({
  spec, value, left, top, width, height, scale,
  handlers, onDoubleClick, onHoverChange, onLinkClick,
}: ComposeOutputLayerProps) {
  return (
    <div
      className="node-panel-compose-output-layer"
      onMouseDown={(e) => { if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault(); }}
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (onLink(e)) {
          handlers.onPointerCancel();
          return;
        }
        handlers.onPointerDown(e);
      }}
      onPointerMove={handlers.onPointerMove}
      onPointerUp={handlers.onPointerUp}
      onPointerCancel={handlers.onPointerCancel}
      onDoubleClick={(e) => {
        if (onLink(e)) return;
        onDoubleClick();
      }}
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
      style={{
        position: "fixed",
        left,
        top,
        width,
        height,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        zIndex: Z_INDEX.nodes,
        borderRadius: NODE_CORNER_RADIUS,
      }}
    >
      <spec.Output value={value} onLinkClick={onLinkClick} />
    </div>
  );
}

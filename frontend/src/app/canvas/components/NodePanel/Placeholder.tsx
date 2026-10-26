"use client";

import { Loader2 } from "lucide-react";
import { COLORS, NODE_CORNER_RADIUS, Z_INDEX } from "@/constants/canvas.constants";
import type { PanelOutput } from "@/store/nodePanel.store";
import type { NodeKindSpec } from "./nodeKinds";

interface PlaceholderProps {
  spec: NodeKindSpec;
  /** What the box shows, if anything yet. */
  shown: PanelOutput | undefined;
  busy: boolean;
  /** Generating the nodes wired into this one first (#11). */
  waiting: boolean;
  /** This node failed while a downstream node was generating it. */
  upstreamError?: string;
  dragging: boolean;
  isPanelOpen: boolean;
  /** Top-left on screen, and the size in canvas units. */
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
  handlers: {
    onPointerDown:   (e: React.PointerEvent) => void;
    onPointerMove:   (e: React.PointerEvent) => void;
    onPointerUp:     (e: React.PointerEvent) => void;
    onPointerCancel: () => void;
  };
  onDoubleClick: () => void;
  onHoverChange: (hovered: boolean) => void;
}

/** The node's box: its output, a spinner while generating, or the kind's empty state. */
export default function Placeholder({
  spec, shown, busy, waiting, upstreamError, dragging, isPanelOpen,
  left, top, width, height, scale,
  handlers, onDoubleClick, onHoverChange,
}: PlaceholderProps) {
  return (
    <button
      // Shift/Ctrl+click is a selection gesture here, but the browser reads a
      // shift-click as "extend the text selection" and paints everything between
      // the two clicks, image included, in its highlight blue.
      onMouseDown={(e) => { if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault(); }}
      // The generated image inside is an <img>, which the browser drags natively.
      // A native drag swallows the pointer gesture -- a selected Frame's drag
      // stalled after a few px -- and Chrome hands the image over as a file, so
      // the board's drop handler added it again as a new image (#131). Moving a
      // node is this element's own pointer handling; the browser's is never wanted.
      onDragStart={(e) => e.preventDefault()}
      {...handlers}
      onDoubleClick={onDoubleClick}
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
      className="node-panel-placeholder"
      style={{
        position: "fixed",
        left,
        top,
        width,
        height,
        // Laid out in canvas units, then scaled — keeps the icon and label
        // proportional to the node instead of clipping at low zoom.
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        zIndex: Z_INDEX.nodes,
        background: COLORS.placeholder,
        borderRadius: NODE_CORNER_RADIUS,
        // "move" only while a drag is actually in progress — at rest it would
        // claim the node is moving when it is not. Matches uploaded images, where
        // the hover outline carries the "you can move this" signal instead.
        // "pointer" while the panel is open: the placeholder acts as a button
        // there, collapsing the panel on click.
        cursor: isPanelOpen ? "pointer" : dragging ? "move" : "default",
        pointerEvents: "auto",
      }}
    >
      {shown ? (
        // A written kind's text is drawn by ComposeOutputLayer, over this box,
        // so its links can be clicked.
        spec.authored ? null : <spec.Output value={shown.value} />
      ) : busy ? (
        // Shown on the node itself, not only in the panel: a video generation
        // runs for minutes and the panel is usually closed by then. The rest of
        // the canvas stays interactive throughout.
        <div className="node-panel-placeholder-content">
          <Loader2 size={22} aria-hidden className="node-panel-loader" />
          <span className="node-panel-placeholder-text">{waiting ? "Waiting for upstream…" : "Generating…"}</span>
        </div>
      ) : upstreamError ? (
        <div className="node-panel-placeholder-content" role="alert" title={upstreamError}>
          <span className="node-panel-error">{upstreamError}</span>
        </div>
      ) : (
        <spec.EmptyState />
      )}

      {dragging && <div className="node-panel-drag-overlay" />}
    </button>
  );
}

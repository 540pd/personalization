// Where a wire runs on screen, and the path it draws.
//
// Convention (standard, matches ComfyUI/Blueprint): output = RIGHT edge, input = LEFT edge.
// Konva nodes (uploaded images) are source-only: right-edge output port, no input port.
//
// Port geometry is shared (lib/canvas/ports); these just place it on screen.
// Keeping the conversion out of the port maths is what makes the same
// functions usable by the occlusion tests, which work in canvas units.

import { SNAP_RADIUS } from "@/constants/canvas.constants";
import type { NodeBox } from "./bounds";
import { toScreen, type Point, type Viewport } from "./coords";
import { inputPoint, outputPoint } from "./ports";

export const LINK_STYLES = ["link-curve", "link-straight", "link-elbow"] as const;
export type LinkStyle = (typeof LINK_STYLES)[number];

export function isLinkStyle(value: string): value is LinkStyle {
  return (LINK_STYLES as readonly string[]).includes(value);
}

/** The source end of a wire, committed or still being dragged. */
export interface WireSource {
  fromNodeId: string;
  fromNodeType: "panel" | "konva";
}

/** Where a wire leaves its source, in screen px; null if the source is gone. */
export function wireStart(
  src: WireSource,
  panels: ReadonlyMap<string, NodeBox>,
  konvaNodes: Record<string, NodeBox>,
  vp: Viewport,
): Point | null {
  const node = src.fromNodeType === "konva" ? konvaNodes[src.fromNodeId] : panels.get(src.fromNodeId);
  return node ? toScreen(outputPoint(node), vp) : null;
}

/** Both ends of a committed wire in screen px; null if either node is gone. */
export function wireEnds(
  conn: WireSource & { toNodeId: string },
  panels: ReadonlyMap<string, NodeBox>,
  konvaNodes: Record<string, NodeBox>,
  vp: Viewport,
): { from: Point; to: Point } | null {
  const from = wireStart(conn, panels, konvaNodes, vp);
  // Only panels have input ports
  const toPanel = panels.get(conn.toNodeId);
  if (!from || !toPanel) return null;
  return { from, to: toScreen(inputPoint(toPanel), vp) };
}

/**
 * The input port a wire dropped at `at` snaps to: the first, in the order
 * given, within SNAP_RADIUS, and never the wire's own source.
 */
export function snapPort<P extends Point & { nodeId: string }>(
  ports: readonly P[],
  at: Point,
  fromId: string | null,
): P | null {
  return ports.find(
    (p) => p.nodeId !== fromId && Math.hypot(at.x - p.x, at.y - p.y) < SNAP_RADIUS,
  ) ?? null;
}

/** The SVG path of a wire from `a` to `b`, drawn in `style`. */
export function wirePath(a: Point, b: Point, style: LinkStyle): string {
  if (style === "link-straight") {
    return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  }
  if (style === "link-elbow") {
    const mx = (a.x + b.x) / 2;
    return `M ${a.x} ${a.y} L ${mx} ${a.y} L ${mx} ${b.y} L ${b.x} ${b.y}`;
  }
  // Cubic Bezier (default — link-curve)
  const bend = Math.max(Math.abs(b.x - a.x) * 0.5, 40);
  return `M ${a.x} ${a.y} C ${a.x + bend} ${a.y} ${b.x - bend} ${b.y} ${b.x} ${b.y}`;
}

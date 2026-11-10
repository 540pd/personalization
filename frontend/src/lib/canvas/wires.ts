// Where a wire runs on screen, and the path it draws.
//
// Convention (standard, matches ComfyUI/Blueprint): output = RIGHT edge, input = LEFT edge.
// Konva nodes (uploaded images) are source-only: right-edge output port, no input port.
//
// Port geometry is shared (lib/canvas/ports); these just place it on screen.
// Keeping the conversion out of the port maths is what makes the same
// functions usable by the occlusion tests, which work in canvas units.

import { SNAP_RADIUS } from "@/constants/canvas.constants";
import { boundsOf, type NodeBox } from "./bounds";
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

/** A node's top and bottom on screen: what a wire that doubles back runs around (#456). */
export interface Span {
  top: number;
  bottom: number;
}

/** A node's top and bottom on screen. */
export function spanOf(node: NodeBox, vp: Viewport): Span {
  const b = boundsOf(node);
  return { top: toScreen({ x: b.x, y: b.y }, vp).y, bottom: toScreen({ x: b.x, y: b.y + b.h }, vp).y };
}

function sourceNode(src: WireSource, panels: ReadonlyMap<string, NodeBox>, konvaNodes: Record<string, NodeBox>) {
  return src.fromNodeType === "konva" ? konvaNodes[src.fromNodeId] : panels.get(src.fromNodeId);
}

/** Where a wire leaves its source, in screen px; null if the source is gone. */
export function wireStart(
  src: WireSource,
  panels: ReadonlyMap<string, NodeBox>,
  konvaNodes: Record<string, NodeBox>,
  vp: Viewport,
): Point | null {
  const node = sourceNode(src, panels, konvaNodes);
  return node ? toScreen(outputPoint(node), vp) : null;
}

/** The source's span on screen, for routing the drag preview; null if it is gone. */
export function sourceSpan(
  src: WireSource,
  panels: ReadonlyMap<string, NodeBox>,
  konvaNodes: Record<string, NodeBox>,
  vp: Viewport,
): Span | null {
  const node = sourceNode(src, panels, konvaNodes);
  return node ? spanOf(node, vp) : null;
}

/** Both ends of a committed wire in screen px, and the nodes they sit on; null if either node is gone. */
export function wireEnds(
  conn: WireSource & { toNodeId: string },
  panels: ReadonlyMap<string, NodeBox>,
  konvaNodes: Record<string, NodeBox>,
  vp: Viewport,
): { from: Point; to: Point; around: Around } | null {
  const fromNode = sourceNode(conn, panels, konvaNodes);
  // Only panels have input ports
  const toPanel = panels.get(conn.toNodeId);
  if (!fromNode || !toPanel) return null;
  return {
    from: toScreen(outputPoint(fromNode), vp),
    to: toScreen(inputPoint(toPanel), vp),
    around: { from: spanOf(fromNode, vp), to: spanOf(toPanel, vp) },
  };
}

/**
 * The port a wire dropped at `at` snaps to: the nearest within `radius`
 * (SNAP_RADIUS for inputs, #458), and never the wire's own source.
 */
export function snapPort<P extends Point & { nodeId: string }>(
  ports: readonly P[],
  at: Point,
  fromId: string | null,
  radius: number = SNAP_RADIUS,
): P | null {
  let best: P | null = null;
  let bestDist = radius;
  for (const p of ports) {
    if (p.nodeId === fromId) continue;
    const dist = Math.hypot(at.x - p.x, at.y - p.y);
    if (dist < bestDist) {
      best = p;
      bestDist = dist;
    }
  }
  return best;
}

/** A wire being drawn, or one picked up by its input end to move (#458). */
export interface WireDrag extends WireSource {
  movingId?: string;
}

/**
 * Why a node can't take the dragged wire (#460). "output" is the pointer on
 * another node's output port; the rest are wireBlock's, in its order.
 */
export type WireBlock = "output" | "self" | "connected" | "no-input" | "loop";

/** What the label by the pointer says for each (#460). */
export const WIRE_BLOCK_REASONS: Record<WireBlock, string> = {
  "output":    "An output can't connect to another output",
  "self":      "Can't connect a node to itself",
  "connected": "Already connected",
  "no-input":  "This node doesn't take inputs",
  "loop":      "This would make a loop",
};

/** A committed wire, as the rules see it. */
export type WireEdge = WireSource & { id: string; toNodeId: string };

/**
 * Why a node can't take the wire being dragged, or null when it can. One
 * function for both the blue targets (#458) and the red node (#460), so they
 * always agree. The wire being moved doesn't count against itself, so it may
 * go back where it came from.
 */
export function wireBlock(
  nodeId: string,
  drag: WireDrag,
  connections: readonly WireEdge[],
  takesInput: boolean,
): Exclude<WireBlock, "output"> | null {
  if (nodeId === drag.fromNodeId) return "self";
  const others = connections.filter((c) => c.id !== drag.movingId);
  if (others.some((c) => c.fromNodeId === drag.fromNodeId && c.toNodeId === nodeId)) return "connected";
  if (!takesInput) return "no-input";
  if (reaches(nodeId, drag.fromNodeId, others)) return "loop";
  return null;
}

/** Whether `to` can be reached from `from` by following wires downstream. */
function reaches(from: string, to: string, connections: readonly WireEdge[]): boolean {
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const at = queue.shift()!;
    for (const c of connections) {
      if (c.fromNodeId !== at || seen.has(c.toNodeId)) continue;
      if (c.toNodeId === to) return true;
      seen.add(c.toNodeId);
      queue.push(c.toNodeId);
    }
  }
  return false;
}

/** The nodes at either end of a wire; the drag preview's far end is the pointer, so it has none. */
export interface Around {
  from?: Span;
  to?: Span;
}

// How far a wire that doubles back runs out of a port before it turns, and
// how far its run clears the nodes it goes around (#456).
const ELBOW_STUB = 24;
const CURVE_STUB = 40;
const LANE_GAP = 24;
const ELBOW_RADIUS = 8;

/**
 * The height a wire that doubles back crosses at: through the gap between
 * its two nodes when there is room, else above or below both, whichever is
 * the shorter way round.
 */
function laneY(a: Point, b: Point, around: Around): number {
  const from = around.from ?? { top: a.y, bottom: a.y };
  const to = around.to ?? { top: b.y, bottom: b.y };
  if (to.top - from.bottom >= LANE_GAP) return (from.bottom + to.top) / 2;
  if (from.top - to.bottom >= LANE_GAP) return (to.bottom + from.top) / 2;
  const above = Math.min(from.top, to.top) - LANE_GAP;
  const below = Math.max(from.bottom, to.bottom) + LANE_GAP;
  const cost = (y: number) => Math.abs(a.y - y) + Math.abs(b.y - y);
  return cost(above) < cost(below) ? above : below;
}

const num = (n: number) => Math.round(n * 100) / 100;

/**
 * A polyline with its corners rounded to `radius`. A corner may use all of a
 * segment that ends at a port but only half of one it shares with the next
 * corner, so two corners never overlap.
 */
function roundedPath(pts: Point[], radius: number): string {
  const last = pts.length - 1;
  let d = `M ${num(pts[0].x)} ${num(pts[0].y)}`;
  for (let i = 1; i < last; i++) {
    const [p, c, n] = [pts[i - 1], pts[i], pts[i + 1]];
    const inLen = Math.hypot(c.x - p.x, c.y - p.y);
    const outLen = Math.hypot(n.x - c.x, n.y - c.y);
    const r = Math.min(radius, i === 1 ? inLen : inLen / 2, i === last - 1 ? outLen : outLen / 2);
    if (r <= 0) {
      d += ` L ${num(c.x)} ${num(c.y)}`;
      continue;
    }
    const sx = c.x + ((p.x - c.x) / inLen) * r;
    const sy = c.y + ((p.y - c.y) / inLen) * r;
    const ex = c.x + ((n.x - c.x) / outLen) * r;
    const ey = c.y + ((n.y - c.y) / outLen) * r;
    d += ` L ${num(sx)} ${num(sy)} Q ${num(c.x)} ${num(c.y)} ${num(ex)} ${num(ey)}`;
  }
  return `${d} L ${num(pts[last].x)} ${num(pts[last].y)}`;
}

/** Out of the output, round the nodes at `lane`, and into the input from its left. */
function doubledBack(a: Point, b: Point, lane: number, stub: number): Point[] {
  return [a, { x: a.x + stub, y: a.y }, { x: a.x + stub, y: lane }, { x: b.x - stub, y: lane }, { x: b.x - stub, y: b.y }, b];
}

/**
 * The SVG path of a wire from `a` to `b`, drawn in `style`. A curve or elbow
 * whose input is left of its output doubles back round the nodes in
 * `around` rather than across them (#456).
 */
export function wirePath(a: Point, b: Point, style: LinkStyle, around: Around = {}): string {
  if (style === "link-straight") {
    return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  }
  const back = b.x < a.x;
  if (style === "link-elbow") {
    if (back) return roundedPath(doubledBack(a, b, laneY(a, b, around), ELBOW_STUB), ELBOW_RADIUS);
    const mx = (a.x + b.x) / 2;
    return roundedPath([a, { x: mx, y: a.y }, { x: mx, y: b.y }, b], ELBOW_RADIUS);
  }
  // Cubic Bezier (default — link-curve). Rounded corners as wide as the stub
  // turn the doubled-back route into one smooth S.
  if (back) return roundedPath(doubledBack(a, b, laneY(a, b, around), CURVE_STUB), CURVE_STUB);
  // The bend grows with the drop as well as the run, so a short, steep wire
  // leaves and enters level instead of kinking at its ends.
  const bend = Math.max(Math.abs(b.x - a.x) * 0.5, Math.min(Math.abs(b.y - a.y) / 3, 100), 40);
  return `M ${a.x} ${a.y} C ${a.x + bend} ${a.y} ${b.x - bend} ${b.y} ${b.x} ${b.y}`;
}

// Where a dragged wire would land, and which node can't take it and why
// (#458, #460). Pure: everything it reads about the board comes in as a
// WireScene, built by useWireScene (#466).

import { OUTPUT_HIT_RADIUS, SNAP_RADIUS } from "@/constants/canvas.constants";
import type { Bounds } from "./bounds";
import { toScreen, type Point, type Viewport } from "./coords";
import { snapPort, wireBlock, type WireBlock, type WireDrag, type WireEdge } from "./wires";

/** A port on screen, and the node it belongs to. */
export interface PortAt extends Point {
  nodeId: string;
}

/** What the rules need to know about the board, in screen px. */
export interface WireScene {
  vp: Viewport;
  connections: readonly WireEdge[];
  /** Every input port: Create nodes whose kind takes input. */
  inputPorts: readonly PortAt[];
  /** Every output port: source kinds, and images on the board (#460). */
  outputPorts: readonly PortAt[];
  /**
   * The node under the pointer that wiring cares about, found as for hover,
   * topmost first (#458): a Create node or an image. A drawn shape, text or
   * a frame isn't wired at all, so over one is over nothing (#460).
   */
  nodeUnder: (at: Point) => string | null;
  /** A node's box on the board, panel or image. */
  boxOf: (id: string) => Bounds | null;
  /** Whether a node can be wired into at all: a Create node with an input. */
  takesInput: (id: string) => boolean;
}

/** The node that can't take the wire, why, and which port shows it (#460). */
export interface WireBlocked {
  nodeId: string;
  block: WireBlock;
  port: "input" | "output";
}

/**
 * The output port the pointer is on (#460), unless another node covers it
 * there: a covered port isn't drawn, and the pointer is on that node.
 */
export function outputAt(scene: WireScene, at: Point): PortAt | null {
  const port = snapPort(scene.outputPorts, at, null, OUTPUT_HIT_RADIUS);
  if (!port) return null;
  const under = scene.nodeUnder(at);
  return !under || under === port.nodeId ? port : null;
}

/**
 * Where the dragged wire would land with the pointer at `at`: the nearest
 * input port in snap range that can take it, else the input of the node
 * under the pointer (#458). Nowhere while the pointer is on an output (#460).
 */
export function dropTarget(scene: WireScene, drag: WireDrag, at: Point): PortAt | null {
  if (outputAt(scene, at)) return null;
  const ports = scene.inputPorts.filter((p) => wireBlock(p.nodeId, drag, scene.connections, true) === null);
  const snapped = snapPort(ports, at, drag.fromNodeId);
  if (snapped) return snapped;
  const under = scene.nodeUnder(at);
  return ports.find((p) => p.nodeId === under) ?? null;
}

/** Within snap range of a node's box on screen. */
export function nearBox(at: Point, b: Bounds, vp: Viewport): boolean {
  const tl = toScreen({ x: b.x, y: b.y }, vp);
  const br = toScreen({ x: b.x + b.w, y: b.y + b.h }, vp);
  return at.x >= tl.x - SNAP_RADIUS && at.x <= br.x + SNAP_RADIUS && at.y >= tl.y - SNAP_RADIUS && at.y <= br.y + SNAP_RADIUS;
}

/** One pointer position during a drag: where it lands, or what refuses it. */
export interface WireAt {
  landing: PortAt | null;
  blocked: WireBlocked | undefined;
  /**
   * Whether the pointer has been clear of the source since the press, so the
   * source isn't red the moment a wire leaves it (#460). Carried from one
   * move to the next; it only changes on a move with nowhere to land.
   */
  leftSource: boolean;
}

/**
 * The whole of one pointer move (#458, #460), working out the landing once.
 * Blocked is the node whose output the pointer is on; else the owner of an
 * input port in snap range when no port that can take it is; else the node
 * under the pointer. Undefined while the wire would land, or over nothing.
 */
export function wireAt(scene: WireScene, drag: WireDrag, at: Point, leftSource: boolean): WireAt {
  const landing = dropTarget(scene, drag, at);
  if (landing) return { landing, blocked: undefined, leftSource };

  const source = scene.boxOf(drag.fromNodeId);
  const left = leftSource || (!!source && !nearBox(at, source, scene.vp));
  const isSource = (id: string) => id === drag.fromNodeId;
  const none = { landing: null, blocked: undefined, leftSource: left };

  const out = outputAt(scene, at);
  if (out) {
    if (isSource(out.nodeId) && !left) return none;
    return { ...none, blocked: { nodeId: out.nodeId, block: isSource(out.nodeId) ? "self" : "output", port: "output" } };
  }
  const nodeId = snapPort(scene.inputPorts, at, null)?.nodeId ?? scene.nodeUnder(at);
  if (!nodeId || (isSource(nodeId) && !left)) return none;
  const block = wireBlock(nodeId, drag, scene.connections, scene.takesInput(nodeId));
  return block ? { ...none, blocked: { nodeId, block, port: "input" } } : none;
}

import { describe, expect, it } from "vitest";
import { dropTarget, nearBox, outputAt, wireAt, type PortAt, type WireScene } from "../wireTargets";
import type { Bounds } from "../bounds";
import type { Point } from "../coords";
import type { WireDrag, WireEdge } from "../wires";

// Where a dragged wire lands, and what refuses it (#458, #460, #466).
//
// The board, at scale 1 so screen and board px agree. Each node is 100×100,
// its input on the left edge's middle and its output on the right's:
//   A (0,0)     the wire's source
//   B (300,0)   already wired into A, so A→B would close a loop
//   C (300,300) already wired from A
//   D (300,600) takes the wire
//   E (415,600) takes the wire, its input just right of D
//   K (600,0)   Compose: no input

const box = (x: number, y: number): Bounds => ({ x, y, w: 100, h: 100 });
const boxes: Record<string, Bounds> = { A: box(0, 0), B: box(300, 0), C: box(300, 300), D: box(300, 600), E: box(415, 600), K: box(600, 0) };
const input = (id: string): PortAt => ({ nodeId: id, x: boxes[id].x, y: boxes[id].y + 50 });
const output = (id: string): PortAt => ({ nodeId: id, x: boxes[id].x + 100, y: boxes[id].y + 50 });
const inside = (at: Point, b: Bounds) => at.x >= b.x && at.x <= b.x + b.w && at.y >= b.y && at.y <= b.y + b.h;

const connections: WireEdge[] = [
  { id: "w1", fromNodeId: "A", fromNodeType: "panel", toNodeId: "C" },
  { id: "w2", fromNodeId: "B", fromNodeType: "panel", toNodeId: "A" },
];

function scene(over: Partial<WireScene> = {}): WireScene {
  return {
    vp: { x: 0, y: 0, scale: 1 },
    connections,
    inputPorts: ["A", "B", "C", "D", "E"].map(input),
    outputPorts: ["A", "B", "C", "D", "E", "K"].map(output),
    nodeUnder: (at) => Object.keys(boxes).find((id) => inside(at, boxes[id])) ?? null,
    boxOf: (id) => boxes[id] ?? null,
    takesInput: (id) => id !== "K",
    ...over,
  };
}

const drag: WireDrag = { fromNodeId: "A", fromNodeType: "panel" };

describe("wire targets (#466)", () => {
  it("lands on a takeable input in snap range, ahead of the node under the pointer", () => {
    // Inside D, 25 px from E's input, and clear of D's own output (18 px).
    expect(dropTarget(scene(), drag, { x: 398, y: 668 })?.nodeId).toBe("E");
  });

  it("lands on the input of the node under the pointer when no port is in range", () => {
    expect(dropTarget(scene(), drag, { x: 350, y: 690 })?.nodeId).toBe("D");
  });

  it("never lands while the pointer is on an output, and that output is red", () => {
    const at = output("C");
    expect(dropTarget(scene(), drag, at)).toBeNull();
    expect(wireAt(scene(), drag, at, true)).toEqual({
      landing: null, leftSource: true, blocked: { nodeId: "C", block: "output", port: "output" },
    });
  });

  it("ignores an output another node covers", () => {
    expect(outputAt(scene({ nodeUnder: () => "D" }), output("C"))).toBeNull();
    expect(outputAt(scene(), output("C"))?.nodeId).toBe("C");
  });

  it("doesn't mark the source red until the pointer has left it", () => {
    let left = false;
    // On the source's own output and body right after the press: nothing.
    expect(wireAt(scene(), drag, output("A"), left)).toEqual({ landing: null, blocked: undefined, leftSource: false });
    expect(wireAt(scene(), drag, { x: 50, y: 50 }, left).blocked).toBeUndefined();
    // Away from it, past the snap radius.
    left = wireAt(scene(), drag, { x: 200, y: 200 }, left).leftSource;
    expect(left).toBe(true);
    // Back on it: red, on the port the pointer is on.
    expect(wireAt(scene(), drag, { x: 50, y: 50 }, left).blocked).toEqual({ nodeId: "A", block: "self", port: "input" });
    expect(wireAt(scene(), drag, output("A"), left).blocked).toEqual({ nodeId: "A", block: "self", port: "output" });
  });

  it("only counts the pointer as having left the source on a move with nowhere to land", () => {
    // Far from A, but landing on D: as before #466, that doesn't count.
    expect(wireAt(scene(), drag, { x: 350, y: 690 }, false)).toMatchObject({ landing: { nodeId: "D" }, leftSource: false });
  });

  it("marks a blocked input in snap range, with each reason", () => {
    expect(wireAt(scene(), drag, { x: 310, y: 360 }, true).blocked).toEqual({ nodeId: "C", block: "connected", port: "input" });
    expect(wireAt(scene(), drag, { x: 305, y: 55 }, true).blocked).toEqual({ nodeId: "B", block: "loop", port: "input" });
    // No input port at all: the node under the pointer says why.
    expect(wireAt(scene(), drag, { x: 650, y: 20 }, true).blocked).toEqual({ nodeId: "K", block: "no-input", port: "input" });
  });

  it("over nothing (or a shape, which nodeUnder doesn't report): no landing, nothing red", () => {
    expect(wireAt(scene(), drag, { x: 900, y: 900 }, true)).toEqual({ landing: null, blocked: undefined, leftSource: true });
  });

  it("measures near a box on screen at any zoom", () => {
    const b = box(100, 100);
    for (const scale of [0.5, 1, 1.5]) {
      const vp = { x: 40, y: -20, scale };
      const right = 40 + 200 * scale; // the box's right edge on screen
      const mid = -20 + 150 * scale;
      expect(nearBox({ x: right + 27, y: mid }, b, vp)).toBe(true);
      expect(nearBox({ x: right + 29, y: mid }, b, vp)).toBe(false);
    }
  });
});

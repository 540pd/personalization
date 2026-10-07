import { describe, it, expect } from "vitest";
import { PORT_FRACTION, PORT_WIDTH } from "@/constants/canvas.constants";
import { isCovered, portProbe, type Blocker } from "../occlusion";

// Top-anchored (Konva) and centre-anchored (panel) boxes describing the SAME
// rectangle: x 0..200, y 0..100. Every test below relies on that.
const konvaBox = { canvasX: 0, canvasY: 0, canvasW: 200, canvasH: 100 };
const panelBox = { canvasX: 0, canvasY: 50, w: 200, h: 100 };

const konva = (id: string, z: number, box = konvaBox): Blocker =>
  ({ id, box, layer: "canvas", z });
const panel = (id: string, box = panelBox): Blocker =>
  ({ id, box, layer: "dom" });

/** A box shifted right by dx, still describing the same 200x100 shape. */
const shifted = (dx: number) => ({ ...konvaBox, canvasX: dx });

describe("portProbe", () => {
  it("sits just inside the node, not on its edge", () => {
    const out = portProbe(konvaBox, "output", 1);
    expect(out.x).toBe(200 - PORT_WIDTH / 2);
    expect(out.y).toBe(100 * PORT_FRACTION);

    const inp = portProbe(konvaBox, "input", 1);
    expect(inp.x).toBe(PORT_WIDTH / 2);
  });

  it("scales the inset, because PORT_WIDTH is a fixed screen size", () => {
    expect(portProbe(konvaBox, "output", 0.5).x).toBe(200 - PORT_WIDTH);
    expect(portProbe(konvaBox, "output", 2).x).toBe(200 - PORT_WIDTH / 4);
  });

  it("gives the same probe for a top- and a centre-anchored box", () => {
    expect(portProbe(panelBox, "output", 1)).toEqual(portProbe(konvaBox, "output", 1));
  });
});

describe("isCovered — canvas over canvas", () => {
  const self = konva("self", 0);
  const pt = portProbe(konvaBox, "output", 1);

  it("is covered by a node stacked above it", () => {
    expect(isCovered(pt, self, [konva("other", 1)])).toBe(true);
  });

  it("is not covered by a node stacked below it", () => {
    expect(isCovered(pt, self, [konva("other", -1)])).toBe(false);
  });

  it("is not covered by a node at the same z — strictly greater is required", () => {
    expect(isCovered(pt, self, [konva("other", 0)])).toBe(false);
  });

  it("treats a missing z as 0", () => {
    const noZ: Blocker = { id: "other", box: konvaBox, layer: "canvas" };
    expect(isCovered(pt, self, [noZ])).toBe(false);
    expect(isCovered(pt, konva("self", -1), [noZ])).toBe(true);
  });

  it("never counts the node itself", () => {
    expect(isCovered(pt, self, [konva("self", 99)])).toBe(false);
  });

  it("is not covered by a node that misses the probe point", () => {
    expect(isCovered(pt, self, [konva("other", 1, shifted(500))])).toBe(false);
  });
});

describe("isCovered — dom over canvas", () => {
  const pt = portProbe(konvaBox, "output", 1);

  it("a panel always covers a Konva node, whatever its z", () => {
    // The rule that is easy to get wrong: Konva shapes share one <canvas> and
    // panels are DOM siblings above it, so no z comparison applies.
    const self = konva("self", 999);
    expect(isCovered(pt, self, [panel("p")])).toBe(true);
  });

  it("a Konva node never covers a panel, whatever its z", () => {
    const self = panel("self");
    expect(isCovered(pt, self, [konva("n", 999)])).toBe(false);
  });
});

describe("isCovered — dom over dom", () => {
  // Panels share one z-index, so array order is paint order and the caller
  // passes only the ones painted later.
  it("is covered by a later panel", () => {
    const self = panel("a");
    expect(isCovered(portProbe(panelBox, "output", 1), self, [panel("b")])).toBe(true);
  });

  it("is not covered when the later panel misses the probe", () => {
    const self = panel("a");
    const away = panel("b", { canvasX: 500, canvasY: 50, w: 200, h: 100 });
    expect(isCovered(portProbe(panelBox, "output", 1), self, [away])).toBe(false);
  });
});

describe("per-port granularity", () => {
  // A blocker over one edge must not blank the port at the other edge.
  const self = panel("a");
  const overLeftEdge = panel("b", { canvasX: -150, canvasY: 50, w: 200, h: 100 });

  it("hides the input port only", () => {
    expect(isCovered(portProbe(panelBox, "input", 1), self, [overLeftEdge])).toBe(true);
    expect(isCovered(portProbe(panelBox, "output", 1), self, [overLeftEdge])).toBe(false);
  });
});

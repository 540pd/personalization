import { describe, it, expect } from "vitest";
import {
  LABEL_GAP,
  LABEL_LINE_HEIGHT,
  PORT_FRACTION,
  PORT_WIDTH,
} from "@/constants/canvas.constants";
import { isCovered, labelProbe, portProbe, type Blocker } from "../occlusion";

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

describe("isCovered — across layers", () => {
  const pt = portProbe(konvaBox, "output", 1);

  // Konva shapes share one <canvas> and panels are DOM siblings of it, so
  // there is no per-node answer here: the whole canvas is in front or behind.
  describe("with the DOM layer in front", () => {
    it("a panel covers a Konva node whatever its z", () => {
      expect(isCovered(pt, konva("self", 999), [panel("p")], "dom")).toBe(true);
    });

    it("a Konva node does not cover a panel", () => {
      expect(isCovered(pt, panel("self"), [konva("n", 999)], "dom")).toBe(false);
    });
  });

  describe("with the canvas in front", () => {
    it("a Konva node covers a panel", () => {
      // The case that used to be impossible: a dragged image vanished behind
      // a Create Image node instead of coming to the front.
      expect(isCovered(pt, panel("self"), [konva("n", 0)], "canvas")).toBe(true);
    });

    it("a panel does not cover a Konva node", () => {
      expect(isCovered(pt, konva("self", 0), [panel("p")], "canvas")).toBe(false);
    });
  });

  it("defaults to the DOM layer in front, as before the flip existed", () => {
    expect(isCovered(pt, konva("self", 0), [panel("p")])).toBe(true);
  });

  it("leaves same-layer rules alone whichever layer is in front", () => {
    // Konva-vs-Konva still obeys z, and panel-vs-panel still obeys order.
    expect(isCovered(pt, konva("self", 5), [konva("other", 1)], "canvas")).toBe(false);
    expect(isCovered(pt, konva("self", 1), [konva("other", 5)], "dom")).toBe(true);
    expect(isCovered(portProbe(panelBox, "output", 1), panel("a"), [panel("b")], "canvas")).toBe(true);
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

describe("labelProbe", () => {
  // The name sits above the node, so the probe must land OUTSIDE the node's
  // own bounds -- probing inside would make any overlap hide the name.
  it("sits in the band above the node, not inside it", () => {
    const pt = labelProbe(konvaBox, 1);
    expect(pt.y).toBe(-(LABEL_GAP + LABEL_LINE_HEIGHT / 2));
    expect(pt.y).toBeLessThan(0);
    expect(pt.x).toBeGreaterThan(0);
    expect(pt.x).toBeLessThan(200);
  });

  // LABEL_GAP and LABEL_LINE_HEIGHT are fixed screen sizes, so in canvas
  // units the band is further from the node the more you zoom out.
  it("scales the offset", () => {
    expect(labelProbe(konvaBox, 0.5).y).toBe(-(LABEL_GAP + LABEL_LINE_HEIGHT / 2) * 2);
    expect(labelProbe(konvaBox, 2).y).toBe(-(LABEL_GAP + LABEL_LINE_HEIGHT / 2) / 2);
  });

  // Panels anchor canvasY at the CENTRE; both boxes describe y 0..100, so
  // both labels must land in the same band.
  it("agrees for top-anchored and centre-anchored boxes", () => {
    expect(labelProbe(konvaBox, 1)).toEqual(labelProbe(panelBox, 1));
  });
});

describe("isCovered, for a label", () => {
  // A node directly above, whose bottom edge reaches down into the label
  // band. The band sits at y = -(LABEL_GAP + LABEL_LINE_HEIGHT / 2) = -16,
  // so this box must span past that: -110 .. -10.
  const above = { canvasX: 0, canvasY: -110, canvasW: 200, canvasH: 100 };

  it("hides a name covered by a node painted above it", () => {
    const self = konva("self", 0);
    expect(isCovered(labelProbe(konvaBox, 1), self, [self, konva("over", 5, above)])).toBe(true);
  });

  it("leaves the name alone when the node above paints below it", () => {
    const self = konva("self", 9);
    expect(isCovered(labelProbe(konvaBox, 1), self, [self, konva("under", 1, above)])).toBe(false);
  });

  // The node's own body is below the band, so it can never hide its own name.
  it("is not covered by a sibling that only overlaps the node body", () => {
    const self = konva("self", 0);
    expect(isCovered(labelProbe(konvaBox, 1), self, [self, konva("beside", 5, shifted(20))])).toBe(false);
  });
});

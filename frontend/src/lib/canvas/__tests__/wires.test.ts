import { describe, it, expect } from "vitest";
import { PORT_FRACTION, SNAP_RADIUS } from "@/constants/canvas.constants";
import { isLinkStyle, snapPort, sourceSpan, wireEnds, wirePath, wireStart } from "../wires";

// A panel's canvasY is its vertical centre; a Konva node's is its top.
const panel = (canvasX: number, canvasY: number, w = 200, h = 100) => ({ canvasX, canvasY, w, h });
const konva = (canvasX: number, canvasY: number) => ({ canvasX, canvasY, canvasW: 80, canvasH: 40 });

const panels = new Map([
  ["a", panel(0, 50)],
  ["b", panel(400, 250)],
]);
const konvaNodes = { k: konva(-200, 0) };

describe("isLinkStyle", () => {
  it("accepts the three link tools and nothing else", () => {
    expect(["link-curve", "link-straight", "link-elbow"].every(isLinkStyle)).toBe(true);
    expect(isLinkStyle("pointer")).toBe(false);
    expect(isLinkStyle("link")).toBe(false);
  });
});

describe("wireStart", () => {
  it.each([0.5, 1, 1.5])("puts a panel's start on its right edge at %s zoom", (scale) => {
    const vp = { x: 30, y: -20, scale };
    expect(wireStart({ fromNodeId: "a", fromNodeType: "panel" }, panels, konvaNodes, vp)).toEqual({
      x: 30 + 200 * scale,
      y: -20 + 100 * PORT_FRACTION * scale,
    });
  });

  it("reads a Konva source from the Konva nodes, top-anchored", () => {
    const vp = { x: 0, y: 0, scale: 1 };
    expect(wireStart({ fromNodeId: "k", fromNodeType: "konva" }, panels, konvaNodes, vp)).toEqual({
      x: -120,
      y: 40 * PORT_FRACTION,
    });
  });

  it("is null when the source is gone, or looked up in the wrong store", () => {
    const vp = { x: 0, y: 0, scale: 1 };
    expect(wireStart({ fromNodeId: "gone", fromNodeType: "panel" }, panels, konvaNodes, vp)).toBeNull();
    expect(wireStart({ fromNodeId: "a", fromNodeType: "konva" }, panels, konvaNodes, vp)).toBeNull();
  });
});

describe("wireEnds", () => {
  const vp = { x: 0, y: 0, scale: 1 };

  it("runs from the source's output to the target panel's input", () => {
    expect(wireEnds({ fromNodeId: "a", fromNodeType: "panel", toNodeId: "b" }, panels, konvaNodes, vp)).toEqual({
      from: { x: 200, y: 100 * PORT_FRACTION },
      to: { x: 400, y: 200 + 100 * PORT_FRACTION },
      around: { from: { top: 0, bottom: 100 }, to: { top: 200, bottom: 300 } },
    });
  });

  it("is null when either end is gone", () => {
    expect(wireEnds({ fromNodeId: "gone", fromNodeType: "panel", toNodeId: "b" }, panels, konvaNodes, vp)).toBeNull();
    expect(wireEnds({ fromNodeId: "k", fromNodeType: "konva", toNodeId: "gone" }, panels, konvaNodes, vp)).toBeNull();
  });
});

describe("snapPort", () => {
  const ports = [
    { nodeId: "a", x: 100, y: 100 },
    { nodeId: "b", x: 110, y: 100 },
  ];

  it("takes the first port within SNAP_RADIUS", () => {
    expect(snapPort(ports, { x: 105, y: 100 }, null)?.nodeId).toBe("a");
  });

  it("never snaps a wire to its own source", () => {
    expect(snapPort(ports, { x: 105, y: 100 }, "a")?.nodeId).toBe("b");
  });

  it("is null outside the radius, which is exclusive", () => {
    expect(snapPort(ports, { x: 100, y: 100 + SNAP_RADIUS + 1 }, null)).toBeNull();
    expect(snapPort([ports[0]], { x: 100 + SNAP_RADIUS, y: 100 }, null)).toBeNull();
  });
});

describe("sourceSpan", () => {
  it("is the source's top and bottom on screen, scaled", () => {
    const vp = { x: 0, y: 10, scale: 2 };
    expect(sourceSpan({ fromNodeId: "a", fromNodeType: "panel" }, panels, konvaNodes, vp)).toEqual({ top: 10, bottom: 210 });
    expect(sourceSpan({ fromNodeId: "gone", fromNodeType: "panel" }, panels, konvaNodes, vp)).toBeNull();
  });
});

/** Every point a path's commands name, in order, to check where it runs. */
const points = (d: string) => {
  const n = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  return Array.from({ length: n.length / 2 }, (_, i) => ({ x: n[i * 2], y: n[i * 2 + 1] }));
};

describe("wirePath", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 100, y: 50 };

  it("draws a straight line", () => {
    expect(wirePath(a, b, "link-straight")).toBe("M 0 0 L 100 50");
  });

  it("draws a straight line even when it doubles back", () => {
    expect(wirePath(b, a, "link-straight")).toBe("M 100 50 L 0 0");
  });

  it("draws an elbow that turns halfway across, its corners rounded", () => {
    expect(wirePath(a, b, "link-elbow")).toBe("M 0 0 L 42 0 Q 50 0 50 8 L 50 42 Q 50 50 58 50 L 100 50");
  });

  it("rounds an elbow's corners less where its drop is short", () => {
    expect(wirePath(a, { x: 100, y: 6 }, "link-elbow")).toBe("M 0 0 L 47 0 Q 50 0 50 3 L 50 3 Q 50 6 53 6 L 100 6");
  });

  it("draws a level elbow as a line", () => {
    expect(wirePath(a, { x: 100, y: 0 }, "link-elbow")).toBe("M 0 0 L 50 0 L 50 0 L 100 0");
  });

  it("draws a curve that bends by half the run, at least 40", () => {
    expect(wirePath(a, b, "link-curve")).toBe("M 0 0 C 50 0 50 50 100 50");
    expect(wirePath(a, { x: 10, y: 50 }, "link-curve")).toBe("M 0 0 C 40 0 -30 50 10 50");
  });

  it("bends a short, steep curve by a third of its drop, up to 100", () => {
    expect(wirePath(a, { x: 20, y: 240 }, "link-curve")).toBe("M 0 0 C 80 0 -60 240 20 240");
    expect(wirePath(a, { x: 20, y: 900 }, "link-curve")).toBe("M 0 0 C 100 0 -80 900 20 900");
  });

  describe("doubling back (#456)", () => {
    // The source's output at (500, 130) on a node 100..300 tall; the target's
    // input at (300, y) on a node 200 tall with its port 30% down.
    const from = { x: 500, y: 130 };
    const target = (top: number) => ({ to: { x: 300, y: top + 60 }, span: { top, bottom: top + 200 } });
    const source = { top: 100, bottom: 300 };

    it("runs through the gap when the target is well below", () => {
      const { to, span } = target(400);
      const pts = points(wirePath(from, to, "link-elbow", { from: source, to: span }));
      // Out to the right, down to the middle of the gap (350), left past the input, in from its left.
      expect(pts[0]).toEqual(from);
      expect(pts.at(-1)).toEqual(to);
      expect(Math.max(...pts.map((p) => p.x))).toBe(524);
      expect(Math.min(...pts.map((p) => p.x))).toBe(276);
      expect(pts.some((p) => p.y === 350)).toBe(true);
    });

    it("runs through the gap when the target is well above", () => {
      const { to, span } = target(-200);
      const pts = points(wirePath(from, to, "link-elbow", { from: source, to: span }));
      expect(pts.some((p) => p.y === 50)).toBe(true);
    });

    it("goes below both when they overlap and that is shorter", () => {
      const { to, span } = target(250);
      const pts = points(wirePath({ x: 500, y: 280 }, to, "link-elbow", { from: source, to: span }));
      expect(Math.max(...pts.map((p) => p.y))).toBe(474);
    });

    it("goes above both when they overlap and that is shorter", () => {
      const pts = points(wirePath({ x: 500, y: 110 }, { x: 300, y: 60 }, "link-elbow", { from: source, to: { top: 0, bottom: 200 } }));
      expect(Math.min(...pts.map((p) => p.y))).toBe(-24);
    });

    it("never crosses the source: nothing between its edges at a height inside it", () => {
      for (const top of [400, 150, -200]) {
        const { to, span } = target(top);
        for (const style of ["link-curve", "link-elbow"] as const) {
          const inside = points(wirePath(from, to, style, { from: source, to: span })).filter(
            (p) => p.x < 500 && p.x > 300 && p.y > source.top && p.y < source.bottom,
          );
          expect(inside, `${style} to a target at ${top}`).toEqual([]);
        }
      }
    });

    it("curves round with corners as wide as its stub", () => {
      const { to, span } = target(400);
      expect(wirePath(from, to, "link-curve", { from: source, to: span })).toBe(
        "M 500 130 L 500 130 Q 540 130 540 170 L 540 310 Q 540 350 500 350 L 300 350 Q 260 350 260 390 L 260 420 Q 260 460 300 460 L 300 460",
      );
    });

    it("routes the drag preview, whose far end is the pointer", () => {
      const pts = points(wirePath(from, { x: 300, y: 500 }, "link-curve", { from: source }));
      expect(pts.some((p) => p.y === 400)).toBe(true);
    });
  });
});

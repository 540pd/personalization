import { describe, it, expect } from "vitest";
import { PORT_FRACTION, SNAP_RADIUS } from "@/constants/canvas.constants";
import { isLinkStyle, snapPort, wireEnds, wirePath, wireStart } from "../wires";

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

describe("wirePath", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 100, y: 50 };

  it("draws a straight line", () => {
    expect(wirePath(a, b, "link-straight")).toBe("M 0 0 L 100 50");
  });

  it("draws an elbow that turns halfway across", () => {
    expect(wirePath(a, b, "link-elbow")).toBe("M 0 0 L 50 0 L 50 50 L 100 50");
  });

  it("draws a curve that bends by half the run, at least 40", () => {
    expect(wirePath(a, b, "link-curve")).toBe("M 0 0 C 50 0 50 50 100 50");
    expect(wirePath(a, { x: 10, y: 50 }, "link-curve")).toBe("M 0 0 C 40 0 -30 50 10 50");
  });
});

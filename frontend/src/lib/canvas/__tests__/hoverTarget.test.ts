import { describe, expect, it } from "vitest";
import { hoverBounds, hoverTargetAt, type HoverCandidate } from "../hoverTarget";
import { LABEL_GAP, LABEL_LINE_HEIGHT } from "@/constants/canvas.constants";

const box = (x: number, y: number, w = 100, h = 100) => ({ canvasX: x, canvasY: y, canvasW: w, canvasH: h });
const at = (x: number, y: number) => ({ x, y });

describe("hoverBounds", () => {
  it("adds the name's band above the node, in canvas units", () => {
    const band = LABEL_GAP + LABEL_LINE_HEIGHT;
    expect(hoverBounds(box(0, 100), 1)).toEqual({ x: 0, y: 100 - band, w: 100, h: 100 + band });
    // At 50% the same screen band is twice as tall on the canvas.
    expect(hoverBounds(box(0, 100), 0.5).y).toBe(100 - band * 2);
  });
});

describe("hoverTargetAt", () => {
  const image: HoverCandidate = { id: "img", box: box(0, 0), layer: "canvas", order: 1 };
  const shape: HoverCandidate = { id: "shape", box: box(50, 50), layer: "canvas", order: 2 };
  const panel: HoverCandidate = { id: "panel", box: box(60, 60), layer: "dom", order: 0 };
  const frame: HoverCandidate = { id: "frame", box: box(-50, -50, 400, 400), layer: "frame", order: 0 };

  it("is null over empty board", () => {
    expect(hoverTargetAt(at(500, 500), [image], 1, "dom")).toBeNull();
  });

  it("counts the name's band as the node", () => {
    expect(hoverTargetAt(at(10, -LABEL_GAP), [image], 1, "dom")).toBe("img");
  });

  it("picks the higher z on the canvas", () => {
    expect(hoverTargetAt(at(70, 70), [shape, image], 1, "dom")).toBe("shape");
  });

  it("lets the front layer win across dom and canvas", () => {
    expect(hoverTargetAt(at(70, 70), [image, shape, panel], 1, "dom")).toBe("panel");
    expect(hoverTargetAt(at(70, 70), [image, shape, panel], 1, "canvas")).toBe("shape");
  });

  it("gives a frame the hover only where no node is", () => {
    expect(hoverTargetAt(at(10, 10), [frame, image], 1, "dom")).toBe("img");
    expect(hoverTargetAt(at(300, 300), [frame, image], 1, "dom")).toBe("frame");
  });

  it("among panels, the later one paints on top", () => {
    const later: HoverCandidate = { ...panel, id: "later", order: 1 };
    expect(hoverTargetAt(at(70, 70), [later, panel], 1, "dom")).toBe("later");
  });
});

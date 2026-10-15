import { describe, it, expect, beforeEach } from "vitest";
import {
  panningTool,
  cursorFor,
  drawingTool,
  shapeKindOf,
  useToolStore,
  type Tool,
} from "@/store/tool.store";

describe("panningTool", () => {
  it("is false for pointer, which selects rather than pans", () => {
    expect(panningTool("pointer")).toBe(false);
  });

  // The distinction that did not exist before Frame: every other non-pointer
  // tool pans, so "not pointer" used to be an accurate shorthand.
  it("is false for frame, which draws a region", () => {
    expect(panningTool("frame")).toBe(false);
  });

  it("is true for the tools that really do pan", () => {
    const panning: Tool[] = ["link-straight", "link-elbow", "link-curve", "sticky-note"];
    panning.forEach((t) => expect(panningTool(t)).toBe(true));
  });
});

describe("cursorFor", () => {
  it("offers a crosshair for a draw tool", () => {
    expect(cursorFor("frame")).toBe("crosshair");
  });

  it("leaves everything else on the default", () => {
    expect(cursorFor("pointer")).toBe("default");
    expect(cursorFor("link-straight")).toBe("default");
  });
});

describe("shape tools", () => {
  beforeEach(() => useToolStore.setState({ activeTool: "pointer", lastShape: "rect" }));

  it("draw rather than pan, with a crosshair", () => {
    expect(drawingTool("shape-rect")).toBe(true);
    expect(panningTool("shape-rect")).toBe(false);
    expect(cursorFor("shape-rect")).toBe("crosshair");
  });

  it("name the shape they draw", () => {
    expect(shapeKindOf("shape-rect")).toBe("rect");
    expect(shapeKindOf("shape-ellipse")).toBe("ellipse");
    expect(shapeKindOf("shape-triangle")).toBe("triangle");
    expect(shapeKindOf("shape-diamond")).toBe("diamond");
    expect(shapeKindOf("frame")).toBeNull();
    expect(shapeKindOf("pointer")).toBeNull();
  });

  // What the dock's Shapes button shows and S re-arms.
  it("are remembered as the last shape, and other tools leave it alone", () => {
    useToolStore.getState().setTool("shape-rect");
    useToolStore.getState().setTool("frame");
    expect(useToolStore.getState().lastShape).toBe("rect");
    expect(useToolStore.getState().activeTool).toBe("frame");
  });
});

describe("the text tool", () => {
  // Placing text is a press on the board, so the board must not pan under it.
  it("draws rather than pans, with a text cursor", () => {
    expect(drawingTool("text")).toBe(true);
    expect(panningTool("text")).toBe(false);
    expect(cursorFor("text")).toBe("text");
  });
});

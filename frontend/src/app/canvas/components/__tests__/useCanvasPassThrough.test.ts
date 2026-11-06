// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type Konva from "konva";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { useViewport } from "@/store/viewport.store";
import { overPlaceholder, useCanvasPassThrough } from "../useCanvasPassThrough";
import type { BoardLayers } from "../../board/boardLayers";

const panel = (over: Partial<PanelInstance> = {}): PanelInstance => ({
  id: "p", kind: "image", canvasX: 100, canvasY: 100, w: 100, h: 50,
  ...over,
} as PanelInstance);

describe("overPlaceholder", () => {
  const vp = { x: 0, y: 0, scale: 1 };

  // canvasY is the panel's centre: this one spans y 75..125.
  it("is true over the panel and within the anchor margin", () => {
    expect(overPlaceholder([panel()], vp, 150, 100)).toBe(true);
    expect(overPlaceholder([panel()], vp, 95, 70)).toBe(true);
  });

  it("is false past the margin", () => {
    expect(overPlaceholder([panel()], vp, 80, 100)).toBe(false);
    expect(overPlaceholder([panel()], vp, 150, 140)).toBe(false);
  });

  it("follows the viewport", () => {
    expect(overPlaceholder([panel()], { x: 100, y: 0, scale: 2 }, 350, 200)).toBe(true);
    expect(overPlaceholder([panel()], { x: 100, y: 0, scale: 2 }, 150, 200)).toBe(false);
  });
});

describe("useCanvasPassThrough", () => {
  let container: HTMLDivElement;
  let chromeCanvas: HTMLCanvasElement;
  // What each canvas has under the point: anything on the stage, an image
  // or text on the main canvas, a selection handle on the chrome one.
  let hit: { stage: unknown; main: unknown; handle: unknown };
  const stage = { getIntersection: () => hit.stage } as unknown as Konva.Stage;
  let layers: BoardLayers;

  beforeEach(() => {
    container = document.createElement("div");
    chromeCanvas = document.createElement("canvas");
    hit = { stage: null, main: null, handle: null };
    layers = {
      shapes: {} as Konva.Layer,
      main: { getIntersection: () => hit.main } as unknown as Konva.Layer,
      chrome: {
        getIntersection: () => hit.handle,
        getCanvas: () => ({ _canvas: chromeCanvas }),
      } as unknown as Konva.Layer,
    };
    useViewport.setState({ x: 0, y: 0, scale: 1 });
    useNodePanel.setState({ panels: [panel()] });
  });

  const move = (x: number, y: number) =>
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: x, clientY: y }));
  const mount = (front: "canvas" | "dom", tool: "pointer" | "frame" = "pointer") =>
    renderHook(() => useCanvasPassThrough({ current: container }, { current: stage }, { current: layers }, front, tool));

  it("lets a click through over a placeholder while the canvas is in front", () => {
    mount("canvas");
    move(150, 100);
    expect(container.style.pointerEvents).toBe("none");
    move(600, 600);
    expect(container.style.pointerEvents).toBe("auto");
  });

  it("keeps an image or text on the canvas clickable over a placeholder", () => {
    hit = { stage: {}, main: {}, handle: null };
    mount("canvas");
    move(150, 100);
    expect(container.style.pointerEvents).toBe("auto");
  });

  it("lets a click through to the node over a drawn shape: the shape is behind it (#430)", () => {
    hit = { stage: {}, main: null, handle: null };
    mount("canvas");
    move(150, 100);
    expect(container.style.pointerEvents).toBe("none");
  });

  it("gives the pointer to the chrome canvas on a selection handle only (#430)", () => {
    mount("dom");
    hit = { stage: {}, main: null, handle: {} };
    move(150, 100);
    expect(chromeCanvas.style.pointerEvents).toBe("auto");
    hit = { stage: null, main: null, handle: null };
    move(160, 100);
    expect(chromeCanvas.style.pointerEvents).toBe("none");
  });

  it("stays interactive while a drawing tool is armed", () => {
    mount("canvas", "frame");
    move(150, 100);
    expect(container.style.pointerEvents).toBe("auto");
  });

  it("is interactive again once unmounted, the handles' canvas not", () => {
    const { unmount } = mount("canvas");
    hit = { stage: {}, main: null, handle: {} };
    move(150, 100);
    unmount();
    expect(container.style.pointerEvents).toBe("auto");
    expect(chromeCanvas.style.pointerEvents).toBe("none");
  });
});

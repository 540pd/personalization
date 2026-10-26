// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type Konva from "konva";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { useViewport } from "@/store/viewport.store";
import { overPlaceholder, useCanvasPassThrough } from "../useCanvasPassThrough";

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
  let hit: unknown;
  const stage = { getIntersection: () => hit } as unknown as Konva.Stage;

  beforeEach(() => {
    container = document.createElement("div");
    hit = null;
    useViewport.setState({ x: 0, y: 0, scale: 1 });
    useNodePanel.setState({ panels: [panel()] });
  });

  const move = (x: number, y: number) =>
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: x, clientY: y }));

  it("lets a click through over a placeholder while the canvas is in front", () => {
    renderHook(() => useCanvasPassThrough({ current: container }, { current: stage }, "canvas", "pointer"));
    move(150, 100);
    expect(container.style.pointerEvents).toBe("none");
    move(600, 600);
    expect(container.style.pointerEvents).toBe("auto");
  });

  it("keeps a shape on the canvas clickable over a placeholder", () => {
    hit = {};
    renderHook(() => useCanvasPassThrough({ current: container }, { current: stage }, "canvas", "pointer"));
    move(150, 100);
    expect(container.style.pointerEvents).toBe("auto");
  });

  it("stays interactive while a drawing tool is armed", () => {
    renderHook(() => useCanvasPassThrough({ current: container }, { current: stage }, "canvas", "frame"));
    move(150, 100);
    expect(container.style.pointerEvents).toBe("auto");
  });

  it("is interactive again once unmounted", () => {
    const { unmount } = renderHook(() =>
      useCanvasPassThrough({ current: container }, { current: stage }, "canvas", "pointer"));
    move(150, 100);
    unmount();
    expect(container.style.pointerEvents).toBe("auto");
  });
});

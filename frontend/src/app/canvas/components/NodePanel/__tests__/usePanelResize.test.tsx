// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { canvasHistory } from "@/lib/canvas/history";
import { MIN_NODE_SIZE } from "@/constants/canvas.constants";
import { resizeFromCorner, usePanelResize } from "../hooks/usePanelResize";

const start = { w: 200, h: 100, cx: 0, cy: 50 };

describe("resizeFromCorner", () => {
  it("grows from the bottom-right, keeping the top-left fixed", () => {
    expect(resizeFromCorner(start, 3, 100)).toEqual({ w: 300, h: 150, cx: 0, cy: 75 });
  });

  it("grows from the top-left, keeping the bottom-right fixed", () => {
    expect(resizeFromCorner(start, 0, -100)).toEqual({ w: 300, h: 150, cx: -100, cy: 25 });
  });

  it("keeps the left edge for a right corner and the bottom for a top one", () => {
    expect(resizeFromCorner(start, 1, 100)).toEqual({ w: 300, h: 150, cx: 0, cy: 25 });
    expect(resizeFromCorner(start, 2, -100)).toEqual({ w: 300, h: 150, cx: -100, cy: 75 });
  });

  it("stops at the minimum size", () => {
    expect(resizeFromCorner(start, 3, -1000).w).toBe(MIN_NODE_SIZE);
  });
});

const panel = { id: "a", kind: "image", canvasX: 0, canvasY: 50, w: 200, h: 100 } as PanelInstance;
const ev = (clientX: number, buttons = 1) =>
  ({ clientX, clientY: 0, buttons, pointerId: 1, stopPropagation() {}, currentTarget: { setPointerCapture() {} } }) as unknown as React.PointerEvent;

beforeEach(() => useNodePanel.setState({ panels: [panel] }));
afterEach(() => vi.restoreAllMocks());

describe("usePanelResize", () => {
  it("resizes in canvas units and commits once on release", () => {
    const commit = vi.spyOn(canvasHistory, "commit");
    const setPos = vi.fn();
    const { result } = renderHook(() => usePanelResize(panel, 2, setPos));
    const br = result.current(3);
    br.onPointerDown(ev(0));
    br.onPointerMove(ev(200)); // 200 screen px at 2x = 100 canvas units
    expect(useNodePanel.getState().panels[0]).toMatchObject({ w: 300, h: 150 });
    expect(setPos).toHaveBeenLastCalledWith(0, 75);
    br.onPointerUp();
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("ignores a move on another corner and a stray release", () => {
    const commit = vi.spyOn(canvasHistory, "commit");
    const setPos = vi.fn();
    const { result } = renderHook(() => usePanelResize(panel, 1, setPos));
    result.current(3).onPointerDown(ev(0));
    result.current(0).onPointerMove(ev(50));
    expect(setPos).not.toHaveBeenCalled();
    result.current(3).onPointerUp();
    result.current(3).onPointerUp();
    expect(commit).toHaveBeenCalledTimes(1);
  });
});

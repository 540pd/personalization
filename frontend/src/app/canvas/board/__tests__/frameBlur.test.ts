// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Konva from "konva";
import { useFrames, type FrameRecord } from "@/store/frame.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { canvasHistory } from "@/lib/canvas/history";
import { createFrameRects } from "../frameRects";

const frame: FrameRecord = {
  id: "frame-blur", canvasX: 0, canvasY: 0, canvasW: 200, canvasH: 200, label: "Frame",
};

function gesture() {
  let rect!: Konva.Rect;
  const layer = {
    find: () => [],
    add: (node: Konva.Rect) => {
      rect = node;
      vi.spyOn(node, "moveToBottom").mockReturnValue(true);
    },
    batchDraw: vi.fn(),
    draw: vi.fn(),
  } as unknown as Konva.Layer;
  const rects = createFrameRects(layer);
  rects.render({ [frame.id]: frame });
  vi.spyOn(rect, "getLayer").mockReturnValue(layer);

  // Konva's drag manager uses the stage's pointer cache and window mousemove
  // listeners. No canvas is needed to exercise its real stopDrag/dragend path.
  const pointer = { id: 999, x: 0, y: 0 };
  vi.spyOn(rect, "getStage").mockReturnValue({
    _changedPointerPositions: [pointer],
    _getPointerById: () => pointer,
    setPointersPositions: (e: MouseEvent) => { pointer.x = e.clientX; pointer.y = e.clientY; },
  } as unknown as Konva.Stage);
  rect.startDrag();
  return { rect, rects };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() });
  useFrames.setState({ frames: { [frame.id]: frame }, drag: {}, selectedIds: [] });
  useKonvaNodes.setState({ nodes: {} });
  useNodePanel.setState({ panels: [] });
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Frame rect drag on window blur (#350)", () => {
  it("ends and commits at the last position, ignoring mouse movement after focus returns", () => {
    useKonvaNodes.getState().upsert({
      id: "child", canvasX: 10, canvasY: 10, canvasW: 20, canvasH: 20,
    });
    const { rect, rects } = gesture();
    const commit = vi.spyOn(canvasHistory, "commit");
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 40, clientY: 25 }));
    expect(rect.position()).toEqual({ x: 40, y: 25 });
    expect(rect.isDragging()).toBe(true);

    window.dispatchEvent(new Event("blur"));
    expect(rect.isDragging()).toBe(false);
    expect(useFrames.getState().frames[frame.id]).toMatchObject({ canvasX: 40, canvasY: 25 });
    expect(useKonvaNodes.getState().nodes.child).toMatchObject({ canvasX: 50, canvasY: 35 });
    expect(useFrames.getState().drag).toEqual({});
    expect(commit).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 90, clientY: 80 }));
    window.dispatchEvent(new MouseEvent("mouseup"));
    expect(rect.position()).toEqual({ x: 40, y: 25 });
    expect(useFrames.getState().frames[frame.id]).toMatchObject({ canvasX: 40, canvasY: 25 });
    expect(useKonvaNodes.getState().nodes.child).toMatchObject({ canvasX: 50, canvasY: 35 });
    expect(commit).toHaveBeenCalledTimes(1);
    rects.dispose();
  });

  it("does not run a second end when blur follows a normal release", () => {
    const { rect, rects } = gesture();
    const commit = vi.spyOn(canvasHistory, "commit");
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 15, clientY: 10 }));
    window.dispatchEvent(new MouseEvent("mouseup"));
    window.dispatchEvent(new Event("blur"));
    expect(rect.isDragging()).toBe(false);
    expect(commit).toHaveBeenCalledTimes(1);
    rects.dispose();
  });
});
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { useFrames } from "@/store/frame.store";
import { useViewport } from "@/store/viewport.store";
import { canvasHistory } from "@/lib/canvas/history";
import { usePanelDrag, type PanelDragOptions } from "../hooks/usePanelDrag";

const panel = (over: Partial<PanelInstance> = {}): PanelInstance =>
  ({ id: "a", kind: "image", canvasX: 10, canvasY: 20, w: 100, h: 100, isActive: false, isPanelOpen: false, ...over }) as PanelInstance;

const ev = (clientX: number, clientY: number, over: Record<string, unknown> = {}) =>
  ({ clientX, clientY, buttons: 1, pointerId: 1, currentTarget: { setPointerCapture() {} }, ...over }) as unknown as React.PointerEvent;

function setup(over: Partial<PanelDragOptions> = {}) {
  const opts = {
    instance: panel(), scale: 2, authored: false,
    onActivate: vi.fn(), onOpenPanel: vi.fn(), onClosePanel: vi.fn(), onSetCanvasPos: vi.fn(),
    ...over,
  };
  const { result } = renderHook(() => usePanelDrag(opts));
  return { opts, result };
}

beforeEach(() => {
  useNodePanel.setState({ panels: [panel()] });
  useFrames.setState({ frames: {}, selectedIds: [] });
  useViewport.setState({ x: 0, y: 0, scale: 1 });
});
afterEach(() => vi.restoreAllMocks());

describe("usePanelDrag", () => {
  it("steps a click through inactive → active → panel-open → active", () => {
    const click = (instance: PanelInstance) => {
      const { opts, result } = setup({ instance });
      act(() => {
        result.current.handlers.onPointerDown(ev(0, 0));
        result.current.handlers.onPointerUp(ev(0, 0));
      });
      return opts;
    };
    expect(click(panel()).onActivate).toHaveBeenCalled();
    expect(click(panel({ isActive: true })).onOpenPanel).toHaveBeenCalled();
    expect(click(panel({ isActive: true, isPanelOpen: true })).onClosePanel).toHaveBeenCalled();
  });

  it("only selects an authored kind on a second click", () => {
    const { opts, result } = setup({ instance: panel({ isActive: true }), authored: true });
    act(() => {
      result.current.handlers.onPointerDown(ev(0, 0));
      result.current.handlers.onPointerUp(ev(0, 0));
    });
    expect(opts.onOpenPanel).not.toHaveBeenCalled();
    expect(opts.onClosePanel).not.toHaveBeenCalled();
  });

  it("toggles the selection on a modifier click", () => {
    const toggle = vi.spyOn(useNodePanel.getState(), "togglePanel");
    const { opts, result } = setup();
    act(() => {
      result.current.handlers.onPointerDown(ev(0, 0));
      result.current.handlers.onPointerUp(ev(0, 0, { shiftKey: true }));
    });
    expect(toggle).toHaveBeenCalledWith("a");
    expect(opts.onActivate).not.toHaveBeenCalled();
  });

  it("does not move until the pointer passes 4px, then moves in canvas units and commits", () => {
    const commit = vi.spyOn(canvasHistory, "commit");
    const { opts, result } = setup();
    act(() => result.current.handlers.onPointerDown(ev(0, 0)));
    act(() => result.current.handlers.onPointerMove(ev(3, 0)));
    expect(opts.onSetCanvasPos).not.toHaveBeenCalled();
    act(() => result.current.handlers.onPointerMove(ev(40, 20)));
    expect(result.current.dragging).toBe(true);
    // Dragging selects the node (#24's hole) ...
    expect(opts.onActivate).toHaveBeenCalled();
    // ... and moves it by the screen delta over the zoom.
    expect(opts.onSetCanvasPos).toHaveBeenLastCalledWith(30, 30);
    act(() => result.current.handlers.onPointerUp(ev(40, 20)));
    expect(result.current.dragging).toBe(false);
    expect(commit).toHaveBeenCalledTimes(1);
    // A drag is not a click: the panel does not open.
    expect(opts.onOpenPanel).not.toHaveBeenCalled();
  });

  it("ignores a pointer that did not press on this node", () => {
    const { opts, result } = setup();
    act(() => result.current.handlers.onPointerMove(ev(40, 20)));
    act(() => result.current.handlers.onPointerUp(ev(40, 20)));
    expect(opts.onSetCanvasPos).not.toHaveBeenCalled();
    expect(opts.onActivate).not.toHaveBeenCalled();
  });

  it("does not drag while the panel is open", () => {
    const { opts, result } = setup({ instance: panel({ isActive: true, isPanelOpen: true }) });
    act(() => result.current.handlers.onPointerDown(ev(0, 0)));
    act(() => result.current.handlers.onPointerMove(ev(40, 20)));
    expect(opts.onSetCanvasPos).not.toHaveBeenCalled();
  });

  it("hands the drag to a selected frame around the node (#119)", () => {
    useFrames.setState({
      frames: { f: { id: "f", canvasX: -100, canvasY: -100, canvasW: 400, canvasH: 400 } },
      selectedIds: ["f"],
    } as never);
    const { opts, result } = setup();
    act(() => result.current.handlers.onPointerDown(ev(0, 0)));
    act(() => result.current.handlers.onPointerMove(ev(40, 20)));
    expect(opts.onSetCanvasPos).not.toHaveBeenCalled();
    expect(opts.onActivate).not.toHaveBeenCalled();
    // End the frame drag it started.
    window.dispatchEvent(new Event("pointerup"));
  });

  it("cancel ends the drag", () => {
    const { opts, result } = setup();
    act(() => result.current.handlers.onPointerDown(ev(0, 0)));
    act(() => result.current.handlers.onPointerMove(ev(40, 20)));
    act(() => result.current.handlers.onPointerCancel());
    expect(result.current.dragging).toBe(false);
    act(() => result.current.handlers.onPointerMove(ev(80, 20)));
    expect(opts.onSetCanvasPos).toHaveBeenCalledTimes(1);
  });
});

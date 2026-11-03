// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { useSection } from "@/store/section.store";
import { canvasHistory } from "@/lib/canvas/history";
import { usePanelCommands } from "../hooks/usePanelCommands";

// Delete, Escape and undo for the Create nodes (#468).

const panel = (id: string): PanelInstance =>
  ({ id, kind: "image", canvasX: 0, canvasY: 90, w: 320, h: 180 }) as PanelInstance;

const press = (code: string, target: EventTarget = window) => {
  const e = new KeyboardEvent("keydown", { code, key: code, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
};
const ids = () => useNodePanel.getState().panels.map((p) => p.id);

beforeEach(() => {
  canvasHistory.clear();
  useSection.setState({ section: "playspace" });
  useNodePanel.setState({ panels: [panel("a"), panel("b"), panel("c")], selectedIds: ["a", "b"], openId: "a" });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("usePanelCommands (#468)", () => {
  it("Delete removes the selected nodes, as one undo step keyed on the event", () => {
    renderHook(() => usePanelCommands());
    const commit = vi.spyOn(canvasHistory, "commit");
    const e = press("Delete");
    expect(ids()).toEqual(["c"]);
    expect(e.defaultPrevented).toBe(true);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(e);
  });

  it("Backspace does the same", () => {
    renderHook(() => usePanelCommands());
    press("Backspace");
    expect(ids()).toEqual(["c"]);
  });

  it("does nothing with no node selected", () => {
    useNodePanel.setState({ selectedIds: [] });
    renderHook(() => usePanelCommands());
    const commit = vi.spyOn(canvasHistory, "commit");
    expect(press("Delete").defaultPrevented).toBe(false);
    expect(ids()).toEqual(["a", "b", "c"]);
    expect(commit).not.toHaveBeenCalled();
  });

  it("leaves a key typed into a field alone, and every key while another page is shown", () => {
    renderHook(() => usePanelCommands());
    const field = document.createElement("input");
    document.body.appendChild(field);
    press("Backspace", field);
    expect(ids()).toEqual(["a", "b", "c"]);
    field.remove();

    useSection.setState({ section: "skills" });
    press("Delete");
    expect(ids()).toEqual(["a", "b", "c"]);
  });

  it("Escape collapses the panels and keeps the nodes", () => {
    renderHook(() => usePanelCommands());
    press("Escape");
    expect(useNodePanel.getState().openId).toBeNull();
    expect(useNodePanel.getState().selectedIds).toEqual([]);
    expect(ids()).toEqual(["a", "b", "c"]);
  });

  it("undo brings deleted nodes back", () => {
    renderHook(() => usePanelCommands());
    canvasHistory.commit();
    press("Delete");
    canvasHistory.undo();
    expect(ids()).toEqual(["a", "b", "c"]);
  });

  it("stops listening once unmounted", () => {
    const { unmount } = renderHook(() => usePanelCommands());
    unmount();
    press("Delete");
    expect(ids()).toEqual(["a", "b", "c"]);
  });
});

import { describe, expect, it } from "vitest";
import { useNodePanel, type PanelInstance } from "../nodePanel.store";
import * as bulk from "../nodePanel/bulk";
import * as content from "../nodePanel/content";
import * as geometry from "../nodePanel/geometry";
import { bumpNextId, nextPanelId } from "../nodePanel/ids";
import { persistOptions } from "../nodePanel/persistence";
import * as selection from "../nodePanel/selection";
import type { PanelsState } from "../nodePanel/types";

const node = (id: string, over: Partial<PanelInstance> = {}): PanelInstance => ({
  id, kind: "image", canvasX: 0, canvasY: 0, w: 200, h: 150,
  isActive: false, isPanelOpen: false, ...over,
});

const board = (selectedId: string | null, ...panels: PanelInstance[]): PanelsState => ({ panels, selectedId });

const flags = (s: PanelsState) => s.panels.map((p) => [p.id, p.isActive, p.isPanelOpen]);

const counter = () => {
  let n = 100;
  return () => `panel-${n++}`;
};

describe("selection", () => {
  it("deactivated clears both flags on every panel", () => {
    expect(selection.deactivated([node("a", { isActive: true, isPanelOpen: true })]))
      .toEqual([node("a")]);
  });

  it("addPanel lands the new node selected and, by default, open; the rest go inactive", () => {
    const s = selection.addPanel(board("a", node("a", { isActive: true })), "b", 5, 6, "video", true);
    expect(s.selectedId).toBe("b");
    expect(flags(s)).toEqual([["a", false, false], ["b", true, true]]);
    expect(s.panels[1]).toMatchObject({ kind: "video", canvasX: 5, canvasY: 6 });
    expect(s.panels[1].w).toBeGreaterThan(0);
    expect(selection.addPanel(board(null), "c", 0, 0, "compose", false).panels[0].isPanelOpen).toBe(false);
  });

  it("removePanel clears selectedId only when it named the removed panel", () => {
    expect(selection.removePanel(board("a", node("a"), node("b")), "a")).toEqual(board(null, node("b")));
    expect(selection.removePanel(board("b", node("a"), node("b")), "a").selectedId).toBe("b");
  });

  it("activatePanel and openPanel select one panel, with its panel closed or open", () => {
    const s = board(null, node("a", { isActive: true, isPanelOpen: true }), node("b"));
    expect(flags(selection.activatePanel(s, "b"))).toEqual([["a", false, false], ["b", true, false]]);
    expect(flags(selection.openPanel(s, "b"))).toEqual([["a", false, false], ["b", true, true]]);
    expect(selection.openPanel(s, "b").selectedId).toBe("b");
  });

  it("closePanel collapses one panel and keeps it active", () => {
    const panels = [node("a", { isActive: true, isPanelOpen: true }), node("b", { isPanelOpen: true })];
    const next = selection.closePanel(panels, "a");
    expect(next[0]).toMatchObject({ isActive: true, isPanelOpen: false });
    expect(next[1]).toBe(panels[1]);
  });

  it("closeAllPanels and activateAll clear selectedId", () => {
    const s = board("a", node("a", { isActive: true, isPanelOpen: true }), node("b"));
    expect(selection.closeAllPanels(s)).toEqual(board(null, node("a"), node("b")));
    const all = selection.activateAll(s);
    expect(all.selectedId).toBeNull();
    expect(flags(all)).toEqual([["a", true, false], ["b", true, false]]);
  });

  it("togglePanel flips one panel, keeps the others selected, and closes every panel", () => {
    const s = board("a", node("a", { isActive: true, isPanelOpen: true }), node("b"));
    const t = selection.togglePanel(s, "b");
    expect(t.selectedId).toBeNull();
    expect(flags(t)).toEqual([["a", true, false], ["b", true, false]]);
    expect(flags(selection.togglePanel(t, "a"))).toEqual([["a", false, false], ["b", true, false]]);
  });

  // After Ctrl+A every panel is active while selectedId is null.
  it("removeActive removes by isActive, not selectedId", () => {
    const s = board(null, node("a", { isActive: true }), node("b"), node("c", { isActive: true }));
    expect(selection.removeActive(s)).toEqual(board(null, node("b")));
  });
});

describe("geometry", () => {
  it("raisePanel moves a panel to the end, and returns the same array when it is already there", () => {
    const panels = [node("a"), node("b"), node("c")];
    expect(geometry.raisePanel(panels, "a").map((p) => p.id)).toEqual(["b", "c", "a"]);
    expect(geometry.raisePanel(panels, "c")).toBe(panels);
    expect(geometry.raisePanel(panels, "nope")).toBe(panels);
  });

  it("setCanvasPos moves one panel", () => {
    const [a, b] = geometry.setCanvasPos([node("a"), node("b")], "b", 3, 4);
    expect([a.canvasX, a.canvasY, b.canvasX, b.canvasY]).toEqual([0, 0, 3, 4]);
  });

  it("setCanvasPositions moves the named panels and keeps the rest by reference", () => {
    const panels = [node("a"), node("b")];
    const next = geometry.setCanvasPositions(panels, { a: { x: 1, y: 2 } });
    expect([next[0].canvasX, next[0].canvasY]).toEqual([1, 2]);
    expect(next[1]).toBe(panels[1]);
  });

  it("setSize resizes, and returns the same array when the size is unchanged or the panel is gone", () => {
    const panels = [node("a")];
    expect(geometry.setSize(panels, "a", 10, 20)[0]).toMatchObject({ w: 10, h: 20 });
    expect(geometry.setSize(panels, "a", 200, 150)).toBe(panels);
    expect(geometry.setSize(panels, "nope", 1, 1)).toBe(panels);
  });
});

describe("content", () => {
  it("patchPanel merges into one panel only", () => {
    const panels = [node("a"), node("b")];
    const next = content.patchPanel(panels, "a", { label: "x" });
    expect(next[0].label).toBe("x");
    expect(next[1]).toBe(panels[1]);
  });

  it("setOutput ends the job the result came from", () => {
    const [a] = content.setOutput([node("a", { job: "j1" })], "a", { type: "image", value: "u" });
    expect(a.output).toEqual({ type: "image", value: "u" });
    expect(a.job).toBeUndefined();
  });

  it("setJob records and clears a job", () => {
    expect(content.setJob([node("a")], "a", "j1")[0].job).toBe("j1");
    expect(content.setJob([node("a", { job: "j1" })], "a", undefined)[0].job).toBeUndefined();
  });

  it("setLabel sets labelAuto from `auto`", () => {
    expect(content.setLabel([node("a")], "a", "Kite", true)[0]).toMatchObject({ label: "Kite", labelAuto: true });
    expect(content.setLabel([node("a", { labelAuto: true })], "a", "Mine", false)[0].labelAuto).toBe(false);
  });

  it("setDraft replaces the draft", () => {
    const draft = { model: "m", instruction: "i" };
    expect(content.setDraft([node("a")], "a", draft)[0].draft).toBe(draft);
  });
});

describe("bulk", () => {
  it("pastePanels copies at an offset as the new selection, without the job", () => {
    const src = node("a", { canvasX: 10, canvasY: 20, job: "j1", label: "A", labelAuto: true, isActive: true });
    const { state, idMap } = bulk.pastePanels(board("a", src), [src], 5, counter());
    expect(idMap).toEqual({ a: "panel-100" });
    expect(state!.selectedId).toBe("panel-100");
    expect(flags(state!)).toEqual([["a", false, false], ["panel-100", true, false]]);
    const copy = state!.panels[1];
    expect(copy).toMatchObject({ canvasX: 15, canvasY: 25, label: "A", labelAuto: true });
    expect(copy.job).toBeUndefined();
  });

  it("pastePanels of several leaves selectedId null, and of none changes nothing", () => {
    const { state } = bulk.pastePanels(board(null), [node("a"), node("b")], 0, counter());
    expect(state!.selectedId).toBeNull();
    expect(bulk.pastePanels(board(null), [], 0, counter())).toEqual({ state: null, idMap: {} });
  });

  it("addVariants copies the source's kind, size and draft, with settings not shared", () => {
    const settings = { aspectRatio: "1:1" } as never;
    const src = node("a", { kind: "image", w: 300, h: 300, labelAuto: true,
      draft: { model: "m", instruction: "i", settings } });
    const panels = [src];
    const next = bulk.addVariants(panels, "a",
      [{ canvasX: 1, canvasY: 2, output: { type: "image", value: "v" }, label: "A 2" }], counter());
    const copy = next[1];
    expect(copy).toMatchObject({ id: "panel-100", w: 300, h: 300, canvasX: 1, canvasY: 2,
      label: "A 2", labelAuto: true, isActive: false, isPanelOpen: false });
    expect(copy.draft!.settings).toEqual(settings);
    expect(copy.draft!.settings).not.toBe(settings);
    expect(bulk.addVariants(panels, "nope", [], counter())).toBe(panels);
    expect(bulk.addVariants(panels, "a", [], counter())).toBe(panels);
  });

  // #129: typing is not an undo step; settings are.
  it("replaceAll keeps a surviving panel's instruction and model but restores its settings", () => {
    const current = [node("a", { draft: { model: "new", instruction: "typed", settings: { s: 2 } as never } })];
    const snapshot = [
      node("a", { canvasX: 9, draft: { model: "old", instruction: "old", settings: { s: 1 } as never } }),
      node("b", { draft: { model: "m", instruction: "gone" } }),
    ];
    const [a, b] = bulk.replaceAll(current, snapshot);
    expect(a.canvasX).toBe(9);
    expect(a.draft).toEqual({ model: "new", instruction: "typed", settings: { s: 1 } });
    expect(b).toBe(snapshot[1]);
  });

  // #181: a written kind's text is its content, so its whole draft comes back.
  it("replaceAll restores the whole draft where restoresDraft says so", () => {
    const current = [node("a", { kind: "compose", draft: { model: "", instruction: "typed" } })];
    const snapshot = [node("a", { kind: "compose", draft: { model: "", instruction: "before" } })];
    expect(bulk.replaceAll(current, snapshot, (p) => p.kind === "compose")[0]).toBe(snapshot[0]);
  });
});

describe("ids", () => {
  it("bumpNextId moves the counter past every panel-N id and never backwards", () => {
    bumpNextId([{ id: "panel-500" }, { id: "other" }]);
    expect(nextPanelId()).toBe("panel-501");
    bumpNextId([{ id: "panel-3" }]);
    expect(nextPanelId()).toBe("panel-502");
  });
});

describe("persistOptions", () => {
  it("persists only the panels", () => {
    const s = useNodePanel.getState();
    expect(persistOptions.partialize!({ ...s, panels: [node("a")], selectedId: "a" }))
      .toEqual({ panels: [node("a")] });
    expect(persistOptions.name).toBe("gcos-node-panels");
  });

  it("rehydrates with every panel inactive and the id counter past them", () => {
    const state = { ...useNodePanel.getState(), panels: [node("panel-900", { isActive: true, isPanelOpen: true })] };
    persistOptions.onRehydrateStorage!(state)!(state, undefined);
    expect(state.panels).toEqual([node("panel-900")]);
    expect(nextPanelId()).toBe("panel-901");
  });
});

describe("useNodePanel", () => {
  it("does not notify subscribers when a raise or resize changes nothing", () => {
    useNodePanel.setState({ panels: [node("a"), node("b")], selectedId: null });
    let notified = 0;
    const off = useNodePanel.subscribe(() => notified++);
    useNodePanel.getState().raisePanel("b");
    useNodePanel.getState().setSize("a", 200, 150);
    useNodePanel.getState().addVariants("nope", []);
    useNodePanel.getState().pastePanels([], 10);
    off();
    expect(notified).toBe(0);
  });

  it("loadPanels lands the panels closed and deselected, with new ids past them", () => {
    useNodePanel.getState().loadPanels([{ id: "panel-2000", kind: "image", canvasX: 0, canvasY: 0, w: 1, h: 1 }]);
    const { panels, selectedId } = useNodePanel.getState();
    expect(selectedId).toBeNull();
    expect(panels[0]).toMatchObject({ isActive: false, isPanelOpen: false });
    useNodePanel.getState().addPanel(0, 0);
    expect(useNodePanel.getState().selectedId).toBe("panel-2001");
  });
});

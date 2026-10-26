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
  id, kind: "image", canvasX: 0, canvasY: 0, w: 200, h: 150, ...over,
});

const board = (selectedIds: string[], openId: string | null, ...panels: PanelInstance[]): PanelsState =>
  ({ panels, selectedIds, openId });

/** What a transition left selected and open. */
const sel = (s: PanelsState) => ({ selectedIds: s.selectedIds, openId: s.openId });

const counter = () => {
  let n = 100;
  return () => `panel-${n++}`;
};

describe("selection", () => {
  it("addPanel lands the new node as the only selection and, by default, open", () => {
    const s = selection.addPanel(board(["a"], "a", node("a")), "b", 5, 6, "video", true);
    expect(sel(s)).toEqual({ selectedIds: ["b"], openId: "b" });
    expect(s.panels[1]).toMatchObject({ kind: "video", canvasX: 5, canvasY: 6 });
    expect(s.panels[1].w).toBeGreaterThan(0);
    // The panel objects carry no selection.
    expect(s.panels[0]).toEqual(node("a"));
    expect(selection.addPanel(board([], null), "c", 0, 0, "compose", false).openId).toBeNull();
  });

  it("removePanel drops the panel from the selection and the open slot", () => {
    expect(selection.removePanel(board(["a"], "a", node("a"), node("b")), "a")).toEqual(board([], null, node("b")));
    expect(sel(selection.removePanel(board(["b"], null, node("a"), node("b")), "a"))).toEqual({ selectedIds: ["b"], openId: null });
  });

  it("selectPanel and openPanel select one panel, with its panel closed or open", () => {
    const s = board(["a"], "a", node("a"), node("b"));
    expect(sel(selection.selectPanel(s, "b"))).toEqual({ selectedIds: ["b"], openId: null });
    expect(sel(selection.openPanel(s, "b"))).toEqual({ selectedIds: ["b"], openId: "b" });
    expect(sel(selection.selectPanel(s, null))).toEqual({ selectedIds: [], openId: null });
  });

  it("closePanel collapses the open panel and keeps it selected", () => {
    const s = board(["a"], "a", node("a"));
    expect(sel(selection.closePanel(s, "a"))).toEqual({ selectedIds: ["a"], openId: null });
    // Closing one that is not open changes nothing.
    expect(selection.closePanel(s, "b")).toBe(s);
  });

  it("clearPanelSelection and selectAllPanels close every panel", () => {
    const s = board(["a"], "a", node("a"), node("b"));
    expect(sel(selection.clearPanelSelection(s))).toEqual({ selectedIds: [], openId: null });
    expect(sel(selection.selectAllPanels(s))).toEqual({ selectedIds: ["a", "b"], openId: null });
  });

  it("toggling, adding or dropping one panel keeps the others and closes the open panel", () => {
    const s = board(["a"], "a", node("a"), node("b"));
    const t = selection.togglePanelSelected(s, "b");
    expect(sel(t)).toEqual({ selectedIds: ["a", "b"], openId: null });
    expect(sel(selection.togglePanelSelected(t, "a"))).toEqual({ selectedIds: ["b"], openId: null });
    expect(sel(selection.addPanelToSelection(s, "b"))).toEqual({ selectedIds: ["a", "b"], openId: null });
    expect(sel(selection.removePanelFromSelection(t, "a"))).toEqual({ selectedIds: ["b"], openId: null });
    expect(sel(selection.setPanelSelection(s, ["b"]))).toEqual({ selectedIds: ["b"], openId: null });
  });

  it("removeSelected removes every selected panel, and nothing when none is", () => {
    const s = board(["a", "c"], null, node("a"), node("b"), node("c"));
    expect(selection.removeSelected(s)).toEqual(board([], null, node("b")));
    const none = board([], null, node("a"));
    expect(selection.removeSelected(none)).toBe(none);
  });

  it("a transition that changes nothing returns the same state", () => {
    const s = board(["a"], null, node("a"));
    expect(selection.selectPanel(s, "a")).toBe(s);
    expect(selection.addPanelToSelection(s, "a")).toBe(s);
    const empty = board([], null, node("a"));
    expect(selection.clearPanelSelection(empty)).toBe(empty);
  });

  // Undo and a file load swap the panels; the selection must not outlive them,
  // and undo restores no selection of its own (#244).
  it("keepExisting drops selected and open ids whose panel is gone", () => {
    const s = board(["a", "gone"], "gone", node("a"));
    expect(sel(selection.keepExisting(s))).toEqual({ selectedIds: ["a"], openId: null });
    const fine = board(["a"], "a", node("a"));
    expect(selection.keepExisting(fine)).toBe(fine);
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
    const src = node("a", { canvasX: 10, canvasY: 20, job: "j1", label: "A", labelAuto: true });
    const { state, idMap } = bulk.pastePanels(board(["a"], "a", src), [src], 5, counter());
    expect(idMap).toEqual({ a: "panel-100" });
    expect(sel(state!)).toEqual({ selectedIds: ["panel-100"], openId: null });
    const copy = state!.panels[1];
    expect(copy).toMatchObject({ canvasX: 15, canvasY: 25, label: "A", labelAuto: true });
    expect(copy.job).toBeUndefined();
  });

  it("pastePanels of several selects every copy, and of none changes nothing", () => {
    const { state } = bulk.pastePanels(board([], null), [node("a"), node("b")], 0, counter());
    expect(state!.selectedIds).toEqual(["panel-100", "panel-101"]);
    expect(bulk.pastePanels(board([], null), [], 0, counter())).toEqual({ state: null, idMap: {} });
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
      label: "A 2", labelAuto: true });
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
    expect(persistOptions.partialize!({ ...s, panels: [node("a")], selectedIds: ["a"], openId: "a" }))
      .toEqual({ panels: [node("a")] });
    expect(persistOptions.name).toBe("gcos-node-panels");
  });

  it("rehydrates without the flags older saves stored, and the id counter past them", () => {
    const legacy = { ...node("panel-900"), isActive: true, isPanelOpen: true } as PanelInstance;
    const state = { ...useNodePanel.getState(), panels: [legacy] };
    persistOptions.onRehydrateStorage!(state)!(state, undefined);
    expect(state.panels).toEqual([node("panel-900")]);
    expect(nextPanelId()).toBe("panel-901");
  });
});

describe("useNodePanel", () => {
  it("does not notify subscribers when a raise or resize changes nothing", () => {
    useNodePanel.setState({ panels: [node("a"), node("b")], selectedIds: [], openId: null });
    let notified = 0;
    const off = useNodePanel.subscribe(() => notified++);
    useNodePanel.getState().raisePanel("b");
    useNodePanel.getState().setSize("a", 200, 150);
    useNodePanel.getState().addVariants("nope", []);
    useNodePanel.getState().pastePanels([], 10);
    useNodePanel.getState().clearSelection();
    off();
    expect(notified).toBe(0);
  });

  it("loadPanels lands the panels with nothing selected or open, and new ids past them", () => {
    useNodePanel.getState().loadPanels([{ id: "panel-2000", kind: "image", canvasX: 0, canvasY: 0, w: 1, h: 1 }]);
    const { panels, selectedIds, openId } = useNodePanel.getState();
    expect(selectedIds).toEqual([]);
    expect(openId).toBeNull();
    expect(panels[0]).not.toHaveProperty("isActive");
    useNodePanel.getState().addPanel(0, 0);
    expect(useNodePanel.getState().selectedIds).toEqual(["panel-2001"]);
  });
});

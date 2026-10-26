import { describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { createSelection, nextSelection, sameIds, type SelectionSlice } from "../selectionSlice";

const makeStore = () => create<SelectionSlice>()((set) => createSelection(set));

describe("nextSelection", () => {
  it("select is exactly one, or none for null", () => {
    expect(nextSelection.select(["a", "b"], "c")).toEqual(["c"]);
    expect(nextSelection.select(["a"], null)).toEqual([]);
  });
  it("add appends once; remove drops; toggle flips", () => {
    expect(nextSelection.add(["a"], "b")).toEqual(["a", "b"]);
    expect(nextSelection.add(["a"], "a")).toEqual(["a"]);
    expect(nextSelection.remove(["a", "b"], "a")).toEqual(["b"]);
    expect(nextSelection.toggle(["a", "b"], "a")).toEqual(["b"]);
    expect(nextSelection.toggle(["b"], "a")).toEqual(["b", "a"]);
  });
  it("sameIds compares order too", () => {
    expect(sameIds(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameIds(["a", "b"], ["b", "a"])).toBe(false);
  });
});

describe("createSelection", () => {
  it("every action lands in selectedIds", () => {
    const s = makeStore();
    s.getState().select("a");
    s.getState().addToSelection("b");
    s.getState().toggleSelected("a");
    expect(s.getState().selectedIds).toEqual(["b"]);
    s.getState().setSelection(["x", "y"]);
    s.getState().removeFromSelection("x");
    expect(s.getState().selectedIds).toEqual(["y"]);
    s.getState().clearSelection();
    expect(s.getState().selectedIds).toEqual([]);
  });

  it("an action that changes nothing notifies no one and keeps the array (#155)", () => {
    const s = makeStore();
    s.getState().setSelection(["a", "b"]);
    const before = s.getState().selectedIds;
    const listener = vi.fn();
    const unsub = s.subscribe(listener);
    s.getState().addToSelection("a");
    s.getState().removeFromSelection("z");
    s.getState().setSelection(["a", "b"]);
    expect(listener).not.toHaveBeenCalled();
    expect(s.getState().selectedIds).toBe(before);
    s.getState().clearSelection();
    s.getState().clearSelection();
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
  });
});

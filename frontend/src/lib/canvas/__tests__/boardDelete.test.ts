// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSection } from "@/store/section.store";
import { deleteSelection, registerDeletable, type DeletableKind } from "../boardDelete";

// One Delete for everything on the board (#472).

const key = (code: string, target?: EventTarget) => {
  const e = new KeyboardEvent("keydown", { code, key: code, bubbles: true, cancelable: true });
  if (target) Object.defineProperty(e, "target", { value: target });
  return e;
};

let off: (() => void)[];
let log: string[];

function kind(name: DeletableKind, selected: boolean) {
  const d = { hasSelection: () => selected, deleteSelected: vi.fn(() => void log.push(name)) };
  off.push(registerDeletable(name, d));
  return d;
}

beforeEach(() => {
  off = [];
  log = [];
  useSection.setState({ section: "playspace" });
});
afterEach(() => off.forEach((f) => f()));

describe("deleteSelection (#472)", () => {
  it("deletes from every kind with a selection, in a fixed order, and commits once", () => {
    // Registered out of order on purpose.
    kind("frames", true);
    kind("konva", true);
    kind("panels", true);
    kind("wires", true);
    const commit = vi.fn();
    const e = key("Delete");
    expect(deleteSelection(e, commit)).toBe(true);
    expect(log).toEqual(["wires", "panels", "konva", "frames"]);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it("only touches the kinds that have a selection", () => {
    const wires = kind("wires", false);
    kind("panels", true);
    deleteSelection(key("Backspace"), vi.fn());
    expect(log).toEqual(["panels"]);
    expect(wires.deleteSelected).not.toHaveBeenCalled();
  });

  it("with nothing selected, leaves the key alone and commits nothing", () => {
    kind("konva", false);
    const commit = vi.fn();
    const e = key("Delete");
    expect(deleteSelection(e, commit)).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it("ignores other keys", () => {
    kind("panels", true);
    expect(deleteSelection(key("KeyD"), vi.fn())).toBe(false);
    expect(log).toEqual([]);
  });

  it("does nothing from a text field, or while another page covers the board", () => {
    kind("panels", true);
    const field = document.createElement("textarea");
    document.body.appendChild(field);
    expect(deleteSelection(key("Backspace", field), vi.fn())).toBe(false);
    field.remove();

    useSection.setState({ section: "skills" });
    expect(deleteSelection(key("Delete"), vi.fn())).toBe(false);
    expect(log).toEqual([]);
  });

  it("forgets a kind once it unregisters, but not one registered again since", () => {
    const first = registerDeletable("wires", { hasSelection: () => true, deleteSelected: () => void log.push("old") });
    off.push(registerDeletable("wires", { hasSelection: () => true, deleteSelected: () => void log.push("new") }));
    first(); // an old unregister must not remove the newer one
    deleteSelection(key("Delete"), vi.fn());
    expect(log).toEqual(["new"]);

    off.forEach((f) => f());
    off = [];
    log = [];
    expect(deleteSelection(key("Delete"), vi.fn())).toBe(false);
  });
});

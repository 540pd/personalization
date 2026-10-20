import { describe, expect, it } from "vitest";
import { listActions } from "../localList";

type Item = { id: string; v?: number };

function harness(initial: Item[], accept = true) {
  let state = initial;
  const saved: Item[][] = [];
  const actions = listActions(
    () => state,
    (items) => {
      saved.push(items);
      return accept;
    },
    (items) => {
      state = items;
    },
  );
  return { actions, get: () => state, saved };
}

const ids = (items: Item[]) => items.map((i) => i.id);

describe("listActions", () => {
  it("adds, replaces and removes, saving each new list", () => {
    const h = harness([{ id: "a" }, { id: "b" }]);
    expect(h.actions.add({ id: "c" })).toBe(true);
    expect(ids(h.get())).toEqual(["a", "b", "c"]);
    expect(h.actions.replace({ id: "b", v: 2 })).toBe(true);
    expect(h.get()[1]).toEqual({ id: "b", v: 2 });
    expect(h.actions.remove("a")).toBe(true);
    expect(ids(h.get())).toEqual(["b", "c"]);
    expect(h.saved).toHaveLength(3);
  });

  it("restores into the same place, never twice, clamping the index", () => {
    const h = harness([{ id: "a" }, { id: "c" }]);
    h.actions.restore({ id: "b" }, 1);
    expect(ids(h.get())).toEqual(["a", "b", "c"]);
    h.actions.restore({ id: "b" }, 99);
    expect(ids(h.get())).toEqual(["a", "c", "b"]);
    h.actions.restore({ id: "z" }, -5);
    expect(ids(h.get())).toEqual(["z", "a", "c", "b"]);
  });

  it("changes nothing when the save is refused", () => {
    const h = harness([{ id: "a" }], false);
    expect(h.actions.add({ id: "b" })).toBe(false);
    expect(h.actions.remove("a")).toBe(false);
    expect(ids(h.get())).toEqual(["a"]);
  });
});

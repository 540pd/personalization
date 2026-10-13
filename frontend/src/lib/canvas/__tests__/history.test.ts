import { describe, it, expect } from "vitest";
import { createHistory, type HistoryAdapter } from "../history";

/** A stub slice of state, standing in for Board's layer or the panel store. */
function slice(initial: string) {
  const box = { value: initial };
  const adapter: HistoryAdapter = {
    capture: () => box.value,
    restore: (s) => {
      box.value = s as string;
    },
  };
  return { box, adapter };
}

describe("history", () => {
  it("restores every registered adapter from one entry", () => {
    const h = createHistory();
    const a = slice("a0");
    const b = slice("b0");
    h.register("a", a.adapter);
    h.register("b", b.adapter);
    h.commit();

    a.box.value = "a1";
    b.box.value = "b1";
    h.commit();

    expect(h.undo()).toBe(true);
    expect(a.box.value).toBe("a0");
    expect(b.box.value).toBe("b0");
  });

  // The headline fix. With two stacks, every entry of one was consumed before
  // the first entry of the other, whatever order the edits happened in.
  it("undoes across adapters in chronological order", () => {
    const h = createHistory();
    const img = slice("img0");
    const panel = slice("panel0");
    h.register("img", img.adapter);
    h.register("panel", panel.adapter);
    h.commit();

    img.box.value = "img1";
    h.commit(); // edit 1: the image moved
    panel.box.value = "panel1";
    h.commit(); // edit 2: the panel moved

    h.undo(); // must revert edit 2, the panel
    expect(panel.box.value).toBe("panel0");
    expect(img.box.value).toBe("img1");

    h.undo(); // then edit 1, the image
    expect(img.box.value).toBe("img0");

    h.redo();
    expect(img.box.value).toBe("img1");
    h.redo();
    expect(panel.box.value).toBe("panel1");
  });

  it("discards the redo stack when a commit follows an undo", () => {
    const h = createHistory();
    const a = slice("v0");
    h.register("a", a.adapter);
    h.commit();
    a.box.value = "v1";
    h.commit();

    h.undo();
    expect(a.box.value).toBe("v0");
    expect(h.canRedo()).toBe(true);

    a.box.value = "v2";
    h.commit();
    expect(h.canRedo()).toBe(false);
    expect(h.redo()).toBe(false);
  });

  it("drops the oldest entry past the limit, and stops at the floor", () => {
    const h = createHistory(3);
    const a = slice("v0");
    h.register("a", a.adapter);
    for (let i = 0; i < 5; i++) {
      a.box.value = `v${i}`;
      h.commit();
    }
    expect(h.size).toBe(3);

    // Three entries: v2, v3, v4. Two undos reach the floor.
    expect(h.undo()).toBe(true);
    expect(a.box.value).toBe("v3");
    expect(h.undo()).toBe(true);
    expect(a.box.value).toBe("v2");
    expect(h.undo()).toBe(false);   // no-op, not a throw
    expect(a.box.value).toBe("v2");
  });

  it("is a no-op at both ends", () => {
    const h = createHistory();
    expect(h.undo()).toBe(false);
    expect(h.redo()).toBe(false);
    h.register("a", slice("x").adapter);
    h.commit();
    expect(h.undo()).toBe(false);   // index 0 is the initial state
    expect(h.redo()).toBe(false);
  });

  // Board registers inside a mount effect, so it can appear after the panel
  // store has already committed. Entries from before must not be corrupted.
  it("leaves earlier entries alone when an adapter registers late", () => {
    const h = createHistory();
    const early = slice("e0");
    h.register("early", early.adapter);
    h.commit();
    early.box.value = "e1";
    h.commit();

    const late = slice("L-current");
    h.register("late", late.adapter);

    // Undo reaches an entry captured before `late` existed.
    h.undo();
    expect(early.box.value).toBe("e0");
    // Skipped rather than restored to undefined.
    expect(late.box.value).toBe("L-current");
  });

  it("stops restoring an adapter once it unregisters", () => {
    const h = createHistory();
    const a = slice("a0");
    const unregister = h.register("a", a.adapter);
    h.commit();
    a.box.value = "a1";
    h.commit();

    unregister();
    h.undo();
    expect(a.box.value).toBe("a1");   // untouched
  });

  it("clear() empties the timeline", () => {
    const h = createHistory();
    h.register("a", slice("x").adapter);
    h.commit();
    h.commit();
    expect(h.size).toBe(2);
    h.clear();
    expect(h.size).toBe(0);
    expect(h.canUndo()).toBe(false);
  });

  // One Delete is handled by three listeners (wires, panels, images); it has
  // to come back with one Ctrl+Z.
  it("coalesces commits that share a key into one entry", () => {
    const h = createHistory();
    const wires = slice("w0");
    const nodes = slice("n0");
    h.register("wires", wires.adapter);
    h.register("nodes", nodes.adapter);
    h.commit();

    const keypress = {};
    wires.box.value = "w1";
    h.commit(keypress);
    nodes.box.value = "n1";
    h.commit(keypress);
    expect(h.size).toBe(2);

    expect(h.undo()).toBe(true);
    expect(wires.box.value).toBe("w0");
    expect(nodes.box.value).toBe("n0");
  });

  it("does not coalesce across an undo", () => {
    const h = createHistory();
    const a = slice("a0");
    h.register("a", a.adapter);
    h.commit();
    const key = {};
    a.box.value = "a1";
    h.commit(key);
    h.undo();
    a.box.value = "a2";
    h.commit(key);
    expect(h.size).toBe(2);
    expect(h.canRedo()).toBe(false);
  });
});

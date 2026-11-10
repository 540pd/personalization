import { afterEach, describe, expect, it } from "vitest";
import { useConnectionStore, type Connection } from "../connection.store";

// Moving a wire by its input end (#458): where it can go, and what a drop
// over nothing or Escape does.

const wire = (id: string, from: string, to: string): Connection => ({
  id,
  fromNodeId: from,
  fromNodeType: "panel",
  toNodeId: to,
  toNodeType: "panel",
});

const store = () => useConnectionStore.getState();
const ends = () => store().connections.map((c) => `${c.id}:${c.fromNodeId}>${c.toNodeId}`);

function given(...connections: Connection[]) {
  useConnectionStore.setState({ connections, drag: null, selectedIds: [] });
}

afterEach(() => given());

describe("connection store: drawing a wire", () => {
  it("adds a new wire and selects it", () => {
    given();
    store().startDrag("a", "panel", 0, 0);
    store().commitConnection("b");
    expect(store().connections.map((c) => `${c.fromNodeId}>${c.toNodeId}`)).toEqual(["a>b"]);
    expect(store().selectedIds).toEqual([store().connections[0].id]);
    expect(store().drag).toBeNull();
  });

  it("doesn't make a wire that would close a loop (#460)", () => {
    given(wire("w1", "a", "b"), wire("w2", "b", "c"));
    store().startDrag("c", "panel", 0, 0);
    store().commitConnection("a");
    expect(ends()).toEqual(["w1:a>b", "w2:b>c"]);
    expect(store().drag).toBeNull();
  });

  it("drops a new wire let go over nothing", () => {
    given(wire("w1", "a", "b"));
    store().startDrag("a", "panel", 0, 0);
    store().dropNowhere();
    expect(ends()).toEqual(["w1:a>b"]);
    expect(store().drag).toBeNull();
  });
});

describe("connection store: moving a wire by its input end (#458)", () => {
  it("picks the wire up from its own source", () => {
    given(wire("w1", "a", "b"));
    store().startMove("w1", 5, 6);
    expect(store().drag).toEqual({ fromNodeId: "a", fromNodeType: "panel", cursorX: 5, cursorY: 6, movingId: "w1" });
  });

  it("moves it to another node, keeping its id, and selects it", () => {
    given(wire("w1", "a", "b"), wire("w2", "x", "b"));
    store().startMove("w1", 0, 0);
    store().commitConnection("c");
    expect(ends()).toEqual(["w1:a>c", "w2:x>b"]);
    expect(store().selectedIds).toEqual(["w1"]);
  });

  it("leaves it alone, the same array, when dropped back on its port", () => {
    given(wire("w1", "a", "b"));
    const before = store().connections;
    store().startMove("w1", 0, 0);
    store().commitConnection("b");
    expect(store().connections).toBe(before);
    expect(store().drag).toBeNull();
  });

  it("removes it when dropped over nothing", () => {
    given(wire("w1", "a", "b"), wire("w2", "a", "c"));
    store().startMove("w1", 0, 0);
    store().dropNowhere();
    expect(ends()).toEqual(["w2:a>c"]);
  });

  it("removes it rather than make a duplicate", () => {
    given(wire("w1", "a", "b"), wire("w2", "a", "c"));
    store().startMove("w1", 0, 0);
    store().commitConnection("c");
    expect(ends()).toEqual(["w2:a>c"]);
    expect(store().selectedIds).toEqual([]);
  });

  it("removes it rather than wire a node to itself", () => {
    given(wire("w1", "a", "b"));
    store().startMove("w1", 0, 0);
    store().commitConnection("a");
    expect(ends()).toEqual([]);
  });

  it("removes it rather than close a loop (#460)", () => {
    // b → c moved onto a would make a → b → a.
    given(wire("w1", "a", "b"), wire("w2", "b", "c"));
    store().startMove("w2", 0, 0);
    store().commitConnection("a");
    expect(ends()).toEqual(["w1:a>b"]);
    expect(store().selectedIds).toEqual([]);
  });

  it("puts nothing back and changes nothing on Escape", () => {
    given(wire("w1", "a", "b"));
    const before = store().connections;
    store().startMove("w1", 0, 0);
    store().cancelDrag();
    expect(store().connections).toBe(before);
    expect(store().drag).toBeNull();
  });

  it("ignores a wire that is gone", () => {
    given();
    store().startMove("nope", 0, 0);
    expect(store().drag).toBeNull();
  });
});

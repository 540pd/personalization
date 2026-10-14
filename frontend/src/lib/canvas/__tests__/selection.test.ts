import { describe, it, expect, beforeEach } from "vitest";
import { selectOnly, registerNodeChromeClear } from "../selection";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { useConnectionStore } from "@/store/connection.store";
import { useFrames } from "@/store/frame.store";

const frame = (id: string) => ({
  id, canvasX: 0, canvasY: 0, canvasW: 100, canvasH: 100, label: id,
});

/** Put every kind into a selected state, so each case can prove what survives. */
function selectEverything() {
  useKonvaSelection.getState().select("node-1");
  useFrames.getState().upsert(frame("f1"));
  useFrames.getState().select("f1");
  useConnectionStore.getState().selectConnection("wire-1");
}

const frameSelected = () => useFrames.getState().selectedIds;
const nodeSelected = () => useKonvaSelection.getState().nodeIds;
const wireSelected = () => useConnectionStore.getState().selectedIds;

describe("selectOnly", () => {
  beforeEach(() => {
    registerNodeChromeClear(null);
    useFrames.setState({ frames: {}, selectedIds: [], draft: null, drag: {} });
    useKonvaSelection.getState().deselect();
    useConnectionStore.getState().deselectConnection();
    useNodePanel.getState().clearAll();
  });

  it("keeps the frame and drops the rest", () => {
    selectEverything();
    selectOnly("frame");
    expect(frameSelected()).toEqual(["f1"]);
    expect(nodeSelected()).toEqual([]);
    expect(wireSelected()).toEqual([]);
  });

  // The bug this module exists for: a node click left the frame selected,
  // so Delete hit both.
  it("keeps the node and drops the frame", () => {
    selectEverything();
    selectOnly("node");
    expect(nodeSelected()).toEqual(["node-1"]);
    expect(frameSelected()).toEqual([]);
  });

  it("keeps the wire and drops the frame", () => {
    selectEverything();
    selectOnly("wire");
    expect(wireSelected()).toEqual(["wire-1"]);
    expect(frameSelected()).toEqual([]);
  });

  it("clears every kind when passed null", () => {
    selectEverything();
    selectOnly(null);
    expect(frameSelected()).toEqual([]);
    expect(nodeSelected()).toEqual([]);
    expect(wireSelected()).toEqual([]);
  });

  it("is a no-op on an empty board", () => {
    expect(() => selectOnly(null)).not.toThrow();
    expect(frameSelected()).toEqual([]);
  });

  it("drops node chrome only when the node is not the kept kind", () => {
    let cleared = 0;
    registerNodeChromeClear(() => { cleared += 1; });

    selectOnly("node");
    expect(cleared).toBe(0);

    selectOnly("frame");
    expect(cleared).toBe(1);

    selectOnly(null);
    expect(cleared).toBe(2);
  });

  it("stops calling node chrome once Board unregisters it", () => {
    let cleared = 0;
    registerNodeChromeClear(() => { cleared += 1; });
    registerNodeChromeClear(null);
    selectOnly(null);
    expect(cleared).toBe(0);
  });
});

describe("frame selection", () => {
  beforeEach(() => {
    useFrames.setState({ frames: {}, selectedIds: [], draft: null, drag: {} });
  });

  it("select replaces rather than adds", () => {
    useFrames.getState().upsert(frame("a"));
    useFrames.getState().upsert(frame("b"));
    useFrames.getState().select("a");
    useFrames.getState().select("b");
    expect(frameSelected()).toEqual(["b"]);
  });

  it("selectAll takes every frame, for Ctrl+A", () => {
    useFrames.getState().upsert(frame("a"));
    useFrames.getState().upsert(frame("b"));
    useFrames.getState().selectAll();
    expect(frameSelected().sort()).toEqual(["a", "b"]);
  });

  it("removing a frame drops it from the selection", () => {
    useFrames.getState().upsert(frame("a"));
    useFrames.getState().upsert(frame("b"));
    useFrames.getState().selectAll();
    useFrames.getState().remove("a");
    expect(frameSelected()).toEqual(["b"]);
  });

  // An undo restores a frame set that may no longer contain the selection.
  it("replaceAll keeps only ids that still exist", () => {
    useFrames.getState().upsert(frame("a"));
    useFrames.getState().upsert(frame("b"));
    useFrames.getState().selectAll();
    useFrames.getState().replaceAll({ b: frame("b") });
    expect(frameSelected()).toEqual(["b"]);
  });

  it("tracks a live drag offset per frame, so each name keeps up", () => {
    useFrames.getState().setDrag("a", { dx: 10, dy: 20 });
    useFrames.getState().setDrag("b", { dx: -5, dy: 0 });
    expect(useFrames.getState().drag).toEqual({
      a: { dx: 10, dy: 20 },
      b: { dx: -5, dy: 0 },
    });
    useFrames.getState().clearDrag();
    expect(useFrames.getState().drag).toEqual({});
  });
});

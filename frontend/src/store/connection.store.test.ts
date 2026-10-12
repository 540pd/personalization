import { beforeEach, describe, expect, it } from "vitest";
import { useConnectionStore } from "./connection.store";

describe("connection port types", () => {
  beforeEach(() => {
    useConnectionStore.setState({ connections: [], drag: null, selectedIds: [] });
  });

  it("commits matching IMAGE ports with their port type", () => {
    const store = useConnectionStore.getState();
    store.startDrag("source", "konva", "IMAGE", 0, 0);
    useConnectionStore.getState().commitConnection("target", "IMAGE");

    expect(useConnectionStore.getState().connections).toHaveLength(1);
    expect(useConnectionStore.getState().connections[0]).toMatchObject({
      fromNodeId: "source",
      toNodeId: "target",
      portType: "IMAGE",
    });
  });

  it("rejects a connection when the target port type differs", () => {
    useConnectionStore.getState().startDrag("source", "konva", "IMAGE", 0, 0);
    useConnectionStore.getState().commitConnection("target", "TEXT");

    expect(useConnectionStore.getState().connections).toHaveLength(0);
    expect(useConnectionStore.getState().drag).toBeNull();
  });
});

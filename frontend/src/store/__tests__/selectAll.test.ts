// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { useNodePanel } from "@/store/nodePanel.store";
import { useConnectionStore } from "@/store/connection.store";

beforeEach(() => {
  useNodePanel.getState().clearAll();
  useConnectionStore.setState({ connections: [], drag: null, selectedIds: [] });
});

describe("nodePanel select all / delete", () => {
  it("selectAll makes every panel active and collapses open ones", () => {
    const s = useNodePanel.getState();
    s.addPanel(0, 0);
    s.addPanel(100, 0);
    s.addPanel(200, 0); // the newest lands panel-open
    useNodePanel.getState().selectAll();

    const { panels, selectedIds, openId } = useNodePanel.getState();
    expect(panels).toHaveLength(3);
    expect(selectedIds).toEqual(panels.map((p) => p.id));
    expect(openId).toBeNull();
  });

  it("removeSelected removes every active panel and keeps the rest", () => {
    const s = useNodePanel.getState();
    s.addPanel(0, 0);
    s.addPanel(100, 0);
    const keep = useNodePanel.getState().panels[0].id;
    // Only the newest is active after addPanel.
    useNodePanel.getState().removeSelected();
    expect(useNodePanel.getState().panels.map((p) => p.id)).toEqual([keep]);

    useNodePanel.getState().selectAll();
    useNodePanel.getState().removeSelected();
    expect(useNodePanel.getState().panels).toHaveLength(0);
  });
});

describe("connection selectAll", () => {
  it("selects every wire", () => {
    useConnectionStore.setState({
      connections: [
        { id: "a", fromNodeId: "n1", fromNodeType: "konva", toNodeId: "p1", toNodeType: "panel" },
        { id: "b", fromNodeId: "p1", fromNodeType: "panel", toNodeId: "p2", toNodeType: "panel" },
      ],
    });
    useConnectionStore.getState().selectAll();
    expect(useConnectionStore.getState().selectedIds).toEqual(["a", "b"]);
  });
});

describe("nodePanel toggleSelected", () => {
  it("adds and drops one panel without touching the others", () => {
    const s = useNodePanel.getState();
    s.addPanel(0, 0);
    s.addPanel(100, 0); // active and open
    const [first, second] = useNodePanel.getState().panels.map((p) => p.id);

    useNodePanel.getState().toggleSelected(first);
    expect(useNodePanel.getState().selectedIds.sort()).toEqual([first, second].sort());
    expect(useNodePanel.getState().openId).toBeNull();

    useNodePanel.getState().toggleSelected(first);
    expect(useNodePanel.getState().selectedIds).toEqual([second]);
  });
});

describe("connection replaceConnections", () => {
  it("restores wires and clears the selection", () => {
    const wire = { id: "a", fromNodeId: "n1", fromNodeType: "konva" as const, toNodeId: "p1", toNodeType: "panel" as const };
    useConnectionStore.setState({ connections: [], selectedIds: ["a"] });
    useConnectionStore.getState().replaceConnections([wire]);
    expect(useConnectionStore.getState().connections).toEqual([wire]);
    expect(useConnectionStore.getState().selectedIds).toEqual([]);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { takenLabels, uniqueLabel } from "../labels";

beforeEach(() => {
  useKonvaNodes.setState({ nodes: {} });
  useNodePanel.setState({ panels: [] });
});

describe("uniqueLabel", () => {
  it("returns the base untouched when nothing has claimed it", () => {
    expect(uniqueLabel("cat", [])).toBe("cat");
    expect(uniqueLabel("cat", ["dog"])).toBe("cat");
  });

  it("suffixes a collision and counts up", () => {
    expect(uniqueLabel("cat", ["cat"])).toBe("cat (2)");
    expect(uniqueLabel("cat", ["cat", "cat (2)"])).toBe("cat (3)");
  });

  // Copying a copy is the common case, and "cat (2) (2)" is how it reads
  // without stripping the existing suffix first.
  it("does not stack suffixes", () => {
    expect(uniqueLabel("cat (2)", ["cat", "cat (2)"])).toBe("cat (3)");
  });

  it("fills a gap left by a deleted node", () => {
    expect(uniqueLabel("cat", ["cat", "cat (3)"])).toBe("cat (2)");
  });

  it("treats a trailing number that is not a suffix as part of the name", () => {
    expect(uniqueLabel("photo 2024", ["photo 2024"])).toBe("photo 2024 (2)");
  });
});

describe("takenLabels", () => {
  it("spans both stores, so a panel and an image cannot share a name", () => {
    useKonvaNodes.getState().upsert({
      id: "img", canvasX: 0, canvasY: 0, canvasW: 10, canvasH: 10, label: "cat",
    });
    useNodePanel.setState({
      panels: [{
        id: "p1", kind: "image", canvasX: 0, canvasY: 0,
        isActive: false, isPanelOpen: false, w: 10, h: 10, label: "dog",
      }],
    });
    expect(takenLabels().sort()).toEqual(["cat", "dog"]);
    expect(uniqueLabel("cat", takenLabels())).toBe("cat (2)");
  });

  it("skips unlabelled records rather than reporting undefined", () => {
    useKonvaNodes.getState().upsert({
      id: "img", canvasX: 0, canvasY: 0, canvasW: 10, canvasH: 10,
    });
    expect(takenLabels()).toEqual([]);
  });
});

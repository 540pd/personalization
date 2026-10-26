import { describe, it, expect, beforeEach } from "vitest";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { labelFromInstruction, labelFromText, relabel, takenLabels, uniqueLabel } from "../labels";

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
        w: 10, h: 10, label: "dog",
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

// #130: an auto name follows its node's prompt.
describe("relabel", () => {
  it("keeps the current name when the prompt still yields it", () => {
    expect(relabel("sunset", "sunset", ["sunset"])).toBe("sunset");
  });

  it("keeps a suffix rather than churning it", () => {
    // Regenerating variant (3) with the same prompt must not make it (4).
    expect(relabel("sunset (3)", "sunset", ["sunset", "sunset (2)", "sunset (3)"])).toBe("sunset (3)");
  });

  it("takes the new prompt's name when it is free", () => {
    expect(relabel("sunset (3)", "rain", ["sunset", "sunset (2)", "sunset (3)"])).toBe("rain");
  });

  it("suffixes the new name when another node has it", () => {
    expect(relabel("sunset (3)", "rain", ["rain", "sunset (3)"])).toBe("rain (2)");
  });

  it("does not count the node's own old name as taken", () => {
    // "rain (2)" -> prompt "rain": the node is giving up "rain (2)", and "rain"
    // is held by another node, so it keeps (2) rather than moving to (3).
    expect(relabel("rain (2)", "rain", ["rain", "rain (2)"])).toBe("rain (2)");
    expect(relabel("old", "new", ["old", "new (2)"])).toBe("new");
  });

  it("names a node that has no name yet", () => {
    expect(relabel(undefined, "rain", [])).toBe("rain");
  });
});

describe("labelAuto", () => {
  beforeEach(() => {
    useNodePanel.setState({
      panels: [{ id: "a", kind: "image", canvasX: 0, canvasY: 0, w: 10, h: 10 }],
    } as never);
  });

  it("is set by an auto name and cleared by a rename", () => {
    useNodePanel.getState().setLabel("a", "sunset", true);
    expect(useNodePanel.getState().panels[0].labelAuto).toBe(true);
    useNodePanel.getState().setLabel("a", "hero shot");
    expect(useNodePanel.getState().panels[0]).toMatchObject({ label: "hero shot", labelAuto: false });
  });

  it("travels with a paste and with variant copies", () => {
    useNodePanel.getState().setLabel("a", "sunset", true);
    const src = useNodePanel.getState().panels[0];
    const map = useNodePanel.getState().pastePanels([src], 20);
    const pasted = useNodePanel.getState().panels.find((p) => p.id === map.a)!;
    expect(pasted.labelAuto).toBe(true);

    useNodePanel.getState().addVariants("a", [{ canvasX: 50, canvasY: 0, output: { type: "image", value: "x" }, label: "sunset (2)" }]);
    const copy = useNodePanel.getState().panels.at(-1)!;
    expect(copy).toMatchObject({ label: "sunset (2)", labelAuto: true });
  });
});

describe("labelFromInstruction", () => {
  it("keeps the first six words", () => {
    expect(labelFromInstruction("  a cat on a red sofa in the sun ")).toBe("a cat on a red sofa");
  });

  it("collapses runs of whitespace", () => {
    expect(labelFromInstruction("a\n\ncat   sleeping")).toBe("a cat sleeping");
  });

  it("cuts past 40 characters with an ellipsis", () => {
    const label = labelFromInstruction("photorealistic extraordinarily detailed magnificent landscape");
    expect(label).toBe("photorealistic extraordinarily detailed…");
  });

  it("is empty for an empty instruction", () => {
    expect(labelFromInstruction("   ")).toBe("");
  });
});

describe("labelFromText", () => {
  it("names a box from its first written line", () => {
    expect(labelFromText("\n\nBrand voice\nmore below")).toBe("Brand voice");
  });

  it("leaves out markdown markers", () => {
    expect(labelFromText("# Heading")).toBe("Heading");
    expect(labelFromText("> quoted")).toBe("quoted");
    expect(labelFromText("- item")).toBe("item");
    expect(labelFromText("1. first")).toBe("first");
    expect(labelFromText("2) second")).toBe("second");
  });

  it("keeps a marker that is part of a word", () => {
    expect(labelFromText("#hashtag")).toBe("#hashtag");
  });

  it("is empty when nothing is written", () => {
    expect(labelFromText("\n  \n")).toBe("");
  });
});

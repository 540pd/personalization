import { describe, it, expect, beforeEach } from "vitest";
import { layoutVariants, VARIANT_GAP, VARIANT_PADDING } from "../variants";
import { containsBox } from "@/lib/canvas/bounds";
import { useNodePanel } from "@/store/nodePanel.store";

const source = { x: 100, y: 50, w: 200, h: 150 };

describe("layoutVariants", () => {
  // The node the user was working on must not jump when the batch lands.
  it("puts the first cell exactly where the source node already is", () => {
    const { cells } = layoutVariants(4, source);
    expect(cells[0]).toEqual({ x: source.x, y: source.y });
  });

  it("wraps the frame around the source by its padding", () => {
    const { frame } = layoutVariants(4, source);
    expect(frame.x).toBe(source.x - VARIANT_PADDING);
    expect(frame.y).toBe(source.y - VARIANT_PADDING);
  });

  it.each([
    [2, 2, 1],
    [3, 2, 2],
    [4, 2, 2],
    [5, 3, 2],
    [9, 3, 3],
    [10, 4, 3],
  ])("lays %i variants out in %i columns by %i rows", (count, cols, rows) => {
    const { frame } = layoutVariants(count, source);
    expect(frame.w).toBe(VARIANT_PADDING * 2 + cols * source.w + (cols - 1) * VARIANT_GAP);
    expect(frame.h).toBe(VARIANT_PADDING * 2 + rows * source.h + (rows - 1) * VARIANT_GAP);
  });

  it("fills cells in reading order, right then down", () => {
    const { cells } = layoutVariants(3, source);
    expect(cells).toHaveLength(3);
    expect(cells[1]).toEqual({ x: source.x + source.w + VARIANT_GAP, y: source.y });
    expect(cells[2]).toEqual({ x: source.x, y: source.y + source.h + VARIANT_GAP });
  });

  // Frame membership is full containment, so a variant poking past the edge
  // would be left behind when the frame is dragged.
  it("keeps every cell fully inside the frame, up to the cap", () => {
    for (let n = 1; n <= 10; n++) {
      const { frame, cells } = layoutVariants(n, source);
      cells.forEach((c) => expect(containsBox(frame, { ...c, w: source.w, h: source.h })).toBe(true));
    }
  });
});

describe("variant copies", () => {
  const settings = { aspectRatio: "16:9", quality: "2K", thinking: "Full", temperature: 0.4, variants: 3 };

  beforeEach(() => {
    useNodePanel.getState().clearAll();
    useNodePanel.getState().addPanel(0, 0, "image");
    const id = useNodePanel.getState().panels[0].id;
    useNodePanel.getState().setDraft(id, { model: "gemini-3-pro-image", instruction: "a red kite", settings });
  });

  const sourceId = () => useNodePanel.getState().panels[0].id;
  const place = (n: number) => ({
    canvasX: n * 100, canvasY: 0, label: `v${n}`,
    output: { type: "image" as const, value: `data:image/png;base64,${n}` },
  });

  it("copies the source's inputs onto every variant", () => {
    useNodePanel.getState().addVariants(sourceId(), [place(2), place(3)]);

    const [, a, b] = useNodePanel.getState().panels;
    for (const v of [a, b]) {
      expect(v.kind).toBe("image");
      expect(v.draft?.model).toBe("gemini-3-pro-image");
      expect(v.draft?.instruction).toBe("a red kite");
      expect(v.draft?.settings).toEqual(settings);
    }
  });

  it("gives each copy its own image, place and name", () => {
    useNodePanel.getState().addVariants(sourceId(), [place(2), place(3)]);

    const [, a, b] = useNodePanel.getState().panels;
    expect(a.output?.value).toBe("data:image/png;base64,2");
    expect(b.canvasX).toBe(300);
    expect(a.label).toBe("v2");
    expect(new Set([sourceId(), a.id, b.id]).size).toBe(3);
  });

  // Shared settings would mean changing one variant's aspect ratio quietly
  // resized all of them.
  it("gives each copy settings of its own, not a shared object", () => {
    useNodePanel.getState().addVariants(sourceId(), [place(2)]);

    const [src, copy] = useNodePanel.getState().panels;
    expect(copy.draft?.settings).not.toBe(src.draft?.settings);
  });

  it("adds copies unselected, leaving the source as it was", () => {
    useNodePanel.getState().addVariants(sourceId(), [place(2)]);

    const { panels: [src, copy], selectedIds, openId } = useNodePanel.getState();
    expect(selectedIds).not.toContain(copy.id);
    expect(openId).toBe(src.id);
  });

  it("does nothing for an unknown source or an empty batch", () => {
    useNodePanel.getState().addVariants("nope", [place(2)]);
    useNodePanel.getState().addVariants(sourceId(), []);
    expect(useNodePanel.getState().panels).toHaveLength(1);
  });
});

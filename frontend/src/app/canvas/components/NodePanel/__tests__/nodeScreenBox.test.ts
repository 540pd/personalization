import { describe, expect, it } from "vitest";
import { nodeScreenBox } from "../nodeScreenBox";

// A node's box on screen (#468): the same numbers NodePanel worked out by hand.

describe("nodeScreenBox (#468)", () => {
  const node = { canvasX: 120, canvasY: 300, w: 320, h: 180 };

  for (const scale of [0.5, 1, 1.5]) {
    it(`matches the old maths at ${scale * 100}%`, () => {
      const vp = { x: 37, y: -64, scale };
      const sh = node.h * scale;
      const centre = vp.y + node.canvasY * scale;
      const box = nodeScreenBox(node, vp);
      expect(box.left).toBeCloseTo(vp.x + node.canvasX * scale, 9);
      expect(box.top).toBeCloseTo(centre - sh / 2, 9);
      expect(box.width).toBeCloseTo(node.w * scale, 9);
      expect(box.height).toBeCloseTo(sh, 9);
      expect(box.centreY).toBeCloseTo(centre, 9);
    });
  }
});

import { describe, it, expect } from "vitest";
import { Z_INDEX } from "@/constants/canvas.constants";

/**
 * The rail outranks every canvas tier.
 *
 * The rail shipped with a bare `z-50` written in its own stylesheet, which
 * read as "on top" and was in fact a tie with the port dots (also 50, losing
 * on DOM order) and a loss to the node labels (52). A node dragged under the
 * rail hid correctly while its name and its port dot kept drawing over it.
 *
 * Nothing about that was visible from either file alone, which is the whole
 * reason this is asserted rather than left to a comment.
 */
describe("Z_INDEX", () => {
  const canvasTiers = [
    Z_INDEX.frames,
    Z_INDEX.shapes,
    Z_INDEX.canvasBelow,
    Z_INDEX.nodes,
    Z_INDEX.canvasAbove,
    Z_INDEX.selectionChrome,
    Z_INDEX.wires,
    Z_INDEX.ports,
    Z_INDEX.labels,
  ];

  it("puts the rail above everything drawn in the canvas", () => {
    for (const tier of canvasTiers) expect(Z_INDEX.rail).toBeGreaterThan(tier);
  });

  it("puts labels above ports, so a rename stays reachable", () => {
    // The two that actually collided with the rail, and the pair whose own
    // order a node's name depends on.
    expect(Z_INDEX.labels).toBeGreaterThan(Z_INDEX.ports);
  });

  it("keeps the canvas tiers strictly ordered", () => {
    // No ties: a tie is decided by DOM order, which is how the ports ended up
    // above the rail without either value being obviously wrong.
    const sorted = [...canvasTiers].sort((a, b) => a - b);
    expect(canvasTiers).toEqual(sorted);
    expect(new Set(canvasTiers).size).toBe(canvasTiers.length);
  });
});

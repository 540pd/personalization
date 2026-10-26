import { describe, it, expect } from "vitest";
import { PANEL_W, panelPlacement } from "../panelPlacement";

// GAP and VIEWPORT_MARGIN are both 12.
describe("panelPlacement", () => {
  it("opens to the right of the node when it fits", () => {
    expect(panelPlacement({ nodeLeft: 100, nodeWidth: 200, viewLeft: 0, viewRight: 1200 })).toBe(312);
  });

  it("flips to the left when the right would run off the canvas", () => {
    // Right edge would be 900 + 200 + 12 + 320 = 1432 > 1188.
    expect(panelPlacement({ nodeLeft: 900, nodeWidth: 200, viewLeft: 0, viewRight: 1200 })).toBe(900 - 12 - PANEL_W);
  });

  it("takes the right exactly up to the margin", () => {
    // 1200 - 12 - 320 - 12 - 200 = 656: the panel ends at 1188.
    expect(panelPlacement({ nodeLeft: 656, nodeWidth: 200, viewLeft: 0, viewRight: 1200 })).toBe(868);
    expect(panelPlacement({ nodeLeft: 657, nodeWidth: 200, viewLeft: 0, viewRight: 1200 })).toBe(657 - 12 - PANEL_W);
  });

  it("does not flip under the sidebar", () => {
    // The left would start at 260 + 300 - 332 = 228, inside a 260px rail.
    const left = panelPlacement({ nodeLeft: 300, nodeWidth: 500, viewLeft: 260, viewRight: 900 });
    expect(left).toBe(900 - PANEL_W - 12);
  });

  it("clamps to the sidebar's edge when neither side fits", () => {
    expect(panelPlacement({ nodeLeft: 300, nodeWidth: 100, viewLeft: 260, viewRight: 500 })).toBe(272);
  });
});

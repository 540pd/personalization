import { describe, it, expect } from "vitest";
import { viewportCentre, stagePositionFor, toCanvas, type Rect } from "@/lib/canvas/coords";
import { viewportBounds } from "../../Minimap/world";
import { SIDEBAR_WIDTH, sidebarInset } from "@/store/sidebar.store";

/**
 * The sidebar's real risk is not the component — it is that six places
 * worked out a centre or an edge from `window.innerWidth`, and every one of
 * them goes quietly wrong once a rail covers the left of the screen. These
 * cover the shared maths those call sites now go through.
 */

const WINDOW = { width: 1400, height: 900 };
const open: Rect = { left: SIDEBAR_WIDTH, top: 0, width: WINDOW.width - SIDEBAR_WIDTH, height: WINDOW.height };
const closed: Rect = { left: 0, top: 0, ...WINDOW };
const vp = { x: 0, y: 0, scale: 1 };

describe("sidebarInset", () => {
  it("covers the rail's width while open and nothing while collapsed", () => {
    expect(sidebarInset(false)).toBe(SIDEBAR_WIDTH);
    expect(sidebarInset(true)).toBe(0);
  });
});

describe("viewportCentre with an inset", () => {
  it("is the middle of the window when nothing is covering it", () => {
    expect(viewportCentre(vp, closed)).toEqual({ x: 700, y: 450 });
  });

  it("shifts right by half the rail, not the whole rail", () => {
    // Visible span is 260..1400, whose middle is 830. Subtracting the full
    // rail (570) or ignoring it (700) are both wrong, and both plausible.
    expect(viewportCentre(vp, open)).toEqual({ x: 830, y: 450 });
  });

  it("stays in the visible half of the screen", () => {
    const c = viewportCentre(vp, open);
    expect(c.x).toBeGreaterThan(SIDEBAR_WIDTH);
  });

  it("accounts for pan and zoom as well as the inset", () => {
    const panned = { x: -500, y: -300, scale: 2 };
    const c = viewportCentre(panned, open);
    // Equivalent to converting the visible centre in screen px.
    expect(c).toEqual(toCanvas({ x: 830, y: 450 }, panned));
  });

  it("is unchanged from the old behaviour when left is omitted", () => {
    // Backwards compatibility: every pre-existing caller passes a bare Size.
    expect(viewportCentre(vp, WINDOW)).toEqual(viewportCentre(vp, closed));
  });
});

describe("stagePositionFor with an inset", () => {
  it("puts the point at the centre of the visible area, not the window", () => {
    const pos = stagePositionFor({ x: 0, y: 0 }, 1, open);
    expect(pos).toEqual({ x: 830, y: 450 });
  });

  it("round-trips with viewportCentre", () => {
    // Centring on a point and then asking what is centred must agree, or the
    // minimap's click-to-pan lands somewhere other than where you clicked.
    const target = { x: 1234, y: -567 };
    const pos = stagePositionFor(target, 1.5, open);
    const back = viewportCentre({ ...pos, scale: 1.5 }, open);
    expect(back.x).toBeCloseTo(target.x, 6);
    expect(back.y).toBeCloseTo(target.y, 6);
  });

  it("is unchanged when left is omitted", () => {
    expect(stagePositionFor({ x: 10, y: 20 }, 2, WINDOW)).toEqual(
      stagePositionFor({ x: 10, y: 20 }, 2, closed)
    );
  });
});

describe("viewportBounds with an inset", () => {
  it("starts at the rail's inner edge, not at canvas 0", () => {
    // Ignoring left would draw the minimap's indicator 260 units too far
    // left — the map would claim you are looking somewhere you are not.
    expect(viewportBounds(vp, open)).toEqual({ x: 260, y: 0, w: 1140, h: 900 });
  });

  it("is narrower than the window by exactly the rail", () => {
    const o = viewportBounds(vp, open);
    const c = viewportBounds(vp, closed);
    expect(c.w - o.w).toBe(SIDEBAR_WIDTH);
  });

  it("scales the inset with zoom, since it is a screen-space offset", () => {
    const b = viewportBounds({ x: 0, y: 0, scale: 2 }, open);
    expect(b.x).toBe(SIDEBAR_WIDTH / 2);
    expect(b.w).toBe((WINDOW.width - SIDEBAR_WIDTH) / 2);
  });

  it("agrees with toCanvas at the visible top-left corner", () => {
    const panned = { x: 120, y: -40, scale: 2 };
    const b = viewportBounds(panned, open);
    expect(b).toMatchObject(toCanvas({ x: SIDEBAR_WIDTH, y: 0 }, panned));
  });
});

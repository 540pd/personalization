import { describe, it, expect, beforeEach } from "vitest";
import { grownToFit, resizeNodeForSettings } from "../aspectResize";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { useFrames } from "@/store/frame.store";

const frame = { x: 0, y: 0, w: 400, h: 300 };

describe("grownToFit", () => {
  it("is null when the box already fits", () => {
    expect(grownToFit(frame, { x: 20, y: 20, w: 100, h: 100 })).toBeNull();
  });

  it("moves only the side the box overflowed, with padding", () => {
    expect(grownToFit(frame, { x: 20, y: 20, w: 100, h: 400 }, 32)).toEqual({ x: 0, y: 0, w: 400, h: 452 });
    expect(grownToFit(frame, { x: 350, y: 20, w: 100, h: 100 }, 32)).toEqual({ x: 0, y: 0, w: 482, h: 300 });
  });

  it("grows up and left too, for a box that overflows there", () => {
    expect(grownToFit(frame, { x: -10, y: -10, w: 50, h: 50 }, 32)).toEqual({ x: -42, y: -42, w: 442, h: 342 });
  });
});

describe("resizeNodeForSettings", () => {
  const panel = (over: Partial<PanelInstance> = {}): PanelInstance =>
    ({ id: "a", kind: "image", canvasX: 40, canvasY: 113, w: 260, h: 146, ...over }) as PanelInstance;

  beforeEach(() => {
    useNodePanel.setState({ panels: [panel()] });
    useFrames.setState({ frames: {} });
  });

  it("keeps the top-left fixed: canvasY is the centre, so it moves by half the growth", () => {
    // Top is 113 - 73 = 40 before; it must still be 40 at 260 tall.
    expect(resizeNodeForSettings("a", 146, 260)).toBe(true);
    const p = useNodePanel.getState().panels[0];
    expect(p).toMatchObject({ w: 146, h: 260, canvasX: 40, canvasY: 40 + 130 });
  });

  it("is a no-op for a node already that size", () => {
    expect(resizeNodeForSettings("a", 260, 146)).toBe(false);
  });

  it("grows a Frame that held the node, and leaves others alone", () => {
    useFrames.setState({
      frames: {
        host: { id: "host", canvasX: 10, canvasY: 10, canvasW: 300, canvasH: 200 } as never,
        away: { id: "away", canvasX: 900, canvasY: 900, canvasW: 100, canvasH: 100 } as never,
      },
    });
    resizeNodeForSettings("a", 146, 260);
    const { host, away } = useFrames.getState().frames;
    expect(host.canvasY + host.canvasH).toBeGreaterThanOrEqual(40 + 260);
    expect(host).toMatchObject({ canvasX: 10, canvasY: 10, canvasW: 300 });
    expect(away).toMatchObject({ canvasX: 900, canvasY: 900, canvasW: 100, canvasH: 100 });
  });
});

describe("replaceAll and settings", () => {
  it("brings settings back from the snapshot, but keeps the instruction being typed", () => {
    const snap = [{ id: "a", draft: { model: "m", instruction: "old", settings: { aspectRatio: "16:9" } } }] as never as PanelInstance[];
    useNodePanel.setState({
      panels: [{ id: "a", draft: { model: "m", instruction: "still typing", settings: { aspectRatio: "9:16" } } }] as never,
    });
    useNodePanel.getState().replaceAll(snap);
    const d = useNodePanel.getState().panels[0].draft!;
    expect(d.instruction).toBe("still typing");
    expect(d.settings).toEqual({ aspectRatio: "16:9" });
  });
});

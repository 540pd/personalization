import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNodePanel } from "@/store/nodePanel.store";
import { useViewport } from "@/store/viewport.store";
import { useLayerOrder } from "@/store/layerOrder.store";
import { canvasHistory } from "@/lib/canvas/history";
import { NODE_KINDS } from "../../components/NodePanel/kinds";
import { CASCADE_STEP, createNodeAtViewportCentre, spawnPoint } from "../createNode";

// The visible canvas is window-sized in the app; fixed here.
vi.mock("../../canvasArea", () => ({
  canvasArea: () => ({ left: 0, top: 0, width: 1000, height: 800 }),
}));

const area = { left: 0, top: 0, width: 1000, height: 800 };

describe("spawnPoint", () => {
  it("centres the node's width on the viewport centre", () => {
    expect(spawnPoint({ x: 0, y: 0, scale: 1 }, area, 200, 0)).toEqual({ x: 400, y: 400 });
  });

  it("follows pan and zoom", () => {
    // Centre on screen (500, 400) is canvas ((500 - 100) / 2, (400 - 50) / 2).
    expect(spawnPoint({ x: 100, y: 50, scale: 2 }, area, 100, 0)).toEqual({ x: 150, y: 175 });
  });

  it("cascades by one step per node already there", () => {
    const p = spawnPoint({ x: 0, y: 0, scale: 1 }, area, 200, 3);
    expect(p).toEqual({ x: 400 + 3 * CASCADE_STEP, y: 400 + 3 * CASCADE_STEP });
  });

  it("leaves room for a sidebar on the left", () => {
    const p = spawnPoint({ x: 0, y: 0, scale: 1 }, { left: 260, top: 0, width: 740, height: 800 }, 0, 0);
    expect(p.x).toBe(260 + 370);
  });
});

describe("createNodeAtViewportCentre", () => {
  beforeEach(() => {
    useNodePanel.setState({ panels: [] });
    useViewport.setState({ x: 0, y: 0, scale: 1 });
    useLayerOrder.setState({ topLayer: "canvas" });
  });

  it("adds an image node at the centre, open, raised, as one undo step", () => {
    const commit = vi.spyOn(canvasHistory, "commit").mockImplementation(() => {});
    expect(createNodeAtViewportCentre("image")).toBe(true);
    const [p] = useNodePanel.getState().panels;
    const spec = NODE_KINDS.image!;
    expect(p.kind).toBe("image");
    expect(p.canvasX).toBe(500 - spec.sizeFor(spec.defaultSettings).w / 2);
    expect(p.canvasY).toBe(400);
    expect(p.isPanelOpen).toBe(true);
    expect(useLayerOrder.getState().topLayer).toBe("dom");
    expect(commit).toHaveBeenCalledTimes(1);
    commit.mockRestore();
  });

  it("opens no panel for a written kind", () => {
    const commit = vi.spyOn(canvasHistory, "commit").mockImplementation(() => {});
    expect(createNodeAtViewportCentre("compose")).toBe(true);
    expect(useNodePanel.getState().panels[0].isPanelOpen).toBe(false);
    commit.mockRestore();
  });
});

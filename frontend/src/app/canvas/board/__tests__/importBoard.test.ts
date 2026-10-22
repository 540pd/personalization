import { beforeEach, describe, expect, it, vi } from "vitest";
import { backupBoard, moveImagesToAssets, BOARD_BACKUP_KEY } from "../importBoard";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useNodePanel } from "@/store/nodePanel.store";
import type { BoardFile } from "../boardFileFormat";

// A browser's board becoming the account's first (#324): its pictures moved
// into stored assets, the board as it was kept.

const IMG = "data:image/png;base64,AAAA";
const ASSET = (n: number) => `/api/proxy/assets/0b9f3c1e-2d4a-4b8e-9f6a-00000000000${n}/content`;

beforeEach(() => {
  useKonvaNodes.setState({
    nodes: {
      up: { id: "up", canvasX: 0, canvasY: 0, canvasW: 10, canvasH: 10, imageUrl: IMG },
      stored: { id: "stored", canvasX: 0, canvasY: 0, canvasW: 10, canvasH: 10, imageUrl: ASSET(9) },
      rect: { id: "rect", canvasX: 0, canvasY: 0, canvasW: 10, canvasH: 10, shape: "rect" },
    },
  });
  useNodePanel.setState({
    panels: [
      { id: "gen", kind: "image", canvasX: 0, canvasY: 0, w: 10, h: 10, output: { type: "image", value: IMG } },
      { id: "txt", kind: "instruction", canvasX: 0, canvasY: 0, w: 10, h: 10, output: { type: "text", value: "data:not-a-picture" } },
    ],
  });
});

describe("moveImagesToAssets", () => {
  it("points each data: picture at its stored asset; leaves the rest", async () => {
    let n = 0;
    const store = vi.fn(async () => ASSET(++n));
    expect(await moveImagesToAssets(store)).toEqual({ moved: 2, kept: 0 });
    expect(store).toHaveBeenCalledTimes(2);
    expect(useKonvaNodes.getState().nodes.up.imageUrl).toBe(ASSET(1));
    expect(useKonvaNodes.getState().nodes.stored.imageUrl).toBe(ASSET(9));
    expect(useNodePanel.getState().panels.find((p) => p.id === "gen")!.output).toEqual({ type: "image", value: ASSET(2) });
    expect(useNodePanel.getState().panels.find((p) => p.id === "txt")!.output!.value).toBe("data:not-a-picture");
  });

  it("keeps a picture that could not be stored", async () => {
    expect(await moveImagesToAssets(async () => null)).toEqual({ moved: 0, kept: 2 });
    expect(useKonvaNodes.getState().nodes.up.imageUrl).toBe(IMG);
  });

  it("does not bring back a node deleted meanwhile", async () => {
    const store = vi.fn(async () => {
      useKonvaNodes.getState().remove("up");
      return ASSET(1);
    });
    await moveImagesToAssets(store);
    expect(useKonvaNodes.getState().nodes.up).toBeUndefined();
  });
});

describe("backupBoard", () => {
  it("keeps the board as it was", () => {
    const file = { format: "gcos-playspace", version: 1, nodes: [{ imageUrl: IMG }] } as unknown as BoardFile;
    const kept = new Map<string, string>();
    const storage = { setItem: (k: string, v: string) => kept.set(k, v) } as unknown as Storage;
    backupBoard(file, storage);
    expect(JSON.parse(kept.get(BOARD_BACKUP_KEY)!)).toEqual(file);
  });
});

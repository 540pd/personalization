import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useConnectionStore, type Connection } from "@/store/connection.store";
import { imageKind } from "../kinds/imageKind";
import { generateUpstream, useGenerationProgress } from "../upstreamGeneration";

function node(id: string, instruction: string, output?: string): PanelInstance {
  return {
    id, kind: "image", canvasX: 0, canvasY: 0, w: 320, h: 180,
    isActive: false, isPanelOpen: false,
    draft: { model: `model-${id}`, instruction, settings: { ...imageKind.defaultSettings, temperature: 1 } },
    ...(output ? { output: { type: "image" as const, value: output } } : {}),
  };
}

const wire = (fromNodeId: string, toNodeId: string, fromNodeType: "panel" | "konva" = "panel"): Connection => ({
  id: `${fromNodeId}-${toNodeId}`, fromNodeId, fromNodeType, toNodeId, toNodeType: "panel",
});

beforeEach(() => {
  useNodePanel.setState({ panels: [node("A", "make A"), node("B", "make B")], selectedId: null });
  useKonvaNodes.setState({ nodes: {
    upload: { id: "upload", canvasX: 0, canvasY: 0, canvasW: 100, canvasH: 100, imageUrl: "upload-url", label: "Source" },
  } });
  useConnectionStore.setState({ connections: [wire("upload", "A", "konva"), wire("A", "B")], drag: null, selectedIds: [] });
  useGenerationProgress.setState({ byId: {} });
});

afterEach(() => vi.restoreAllMocks());

describe("generateUpstream", () => {
  it("waits for A and passes its output and name to B", async () => {
    let completeA!: (value: { type: "image"; value: string }) => void;
    const generate = vi.spyOn(imageKind, "generate").mockImplementation(() =>
      new Promise((resolve) => { completeA = resolve; })
    );
    const pending = generateUpstream("B", new AbortController().signal);
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      modelId: "model-A", instruction: "make A", settings: expect.objectContaining({ temperature: 1 }),
      references: [{ kind: "image", url: "upload-url", name: "Source" }],
    }));
    expect(useGenerationProgress.getState().byId.A?.status).toBe("generating");
    expect(useNodePanel.getState().panels[1].output).toBeUndefined();
    completeA({ type: "image", value: "A-url" });
    expect(await pending).toEqual([{ kind: "image", url: "A-url", name: "make A" }]);
    expect(useNodePanel.getState().panels[0].output?.value).toBe("A-url");
    expect(useGenerationProgress.getState().byId.A).toBeUndefined();
  });

  it("reuses an existing A preview without regenerating it", async () => {
    useNodePanel.setState({ panels: [node("A", "make A", "existing"), node("B", "make B")] });
    const generate = vi.spyOn(imageKind, "generate");
    expect(await generateUpstream("B", new AbortController().signal)).toEqual([
      { kind: "image", url: "existing", name: undefined },
    ]);
    expect(generate).not.toHaveBeenCalled();
  });

  it("stops on A failure and marks the failing node", async () => {
    vi.spyOn(imageKind, "generate").mockRejectedValue(new Error("A failed"));
    await expect(generateUpstream("B", new AbortController().signal)).rejects.toThrow("A failed");
    expect(useGenerationProgress.getState().byId.A).toEqual({ status: "error", error: "A failed" });
    expect(useGenerationProgress.getState().byId.B).toBeUndefined();
    expect(useNodePanel.getState().panels[1].output).toBeUndefined();
  });

  it("generates multiple missing predecessors in order and clears errors on retry", async () => {
    useNodePanel.setState({ panels: [node("A", "make A"), node("B", "make B"), node("C", "make C")] });
    useConnectionStore.setState({ connections: [wire("upload", "A", "konva"), wire("A", "B"), wire("B", "C")] });
    useGenerationProgress.setState({ byId: { A: { status: "error", error: "old failure" } } });
    const generate = vi.spyOn(imageKind, "generate")
      .mockResolvedValueOnce({ type: "image", value: "A-url" })
      .mockResolvedValueOnce({ type: "image", value: "B-url" });
    expect(await generateUpstream("C", new AbortController().signal)).toEqual([
      { kind: "image", url: "B-url", name: "make B" },
    ]);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0].references).toEqual([{ kind: "image", url: "A-url", name: "make A" }]);
    expect(useGenerationProgress.getState().byId.A).toBeUndefined();
  });

  it("refuses an empty upstream prompt instead of silently dropping its reference", async () => {
    useNodePanel.setState({ panels: [node("A", "  "), node("B", "make B")] });
    const generate = vi.spyOn(imageKind, "generate");
    await expect(generateUpstream("B", new AbortController().signal)).rejects.toThrow("Add an instruction");
    expect(useGenerationProgress.getState().byId.A?.status).toBe("error");
    expect(generate).not.toHaveBeenCalled();
  });
});
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useNodePanel, type PanelInstance, type PanelOutput } from "@/store/nodePanel.store";
import { useConnectionStore } from "@/store/connection.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useFrames } from "@/store/frame.store";
import { canvasHistory } from "@/lib/canvas/history";
import { useGeneration } from "../hooks/useGeneration";
import type { GenerateArgs, NodeKindSpec, NodeSettings } from "../nodeKinds";

const panel = (over: Partial<PanelInstance> = {}): PanelInstance =>
  ({ id: "a", kind: "image", canvasX: 0, canvasY: 50, w: 100, h: 100, ...over }) as PanelInstance;

const spec = (over: Partial<NodeKindSpec> = {}) =>
  ({ generate: vi.fn(async (): Promise<PanelOutput> => ({ type: "image", value: "data:out" })), ...over }) as unknown as NodeKindSpec;

const draft = { model: "m", instruction: "  a red fox in snow " };
const settings = { variants: 1 } as unknown as NodeSettings;
const stored = () => useNodePanel.getState().panels.find((p) => p.id === "a")!;

beforeEach(() => {
  useNodePanel.setState({ panels: [panel()] });
  useConnectionStore.setState({ connections: [] });
  useKonvaNodes.setState({ nodes: {} });
  useFrames.setState({ frames: {}, selectedIds: [] });
});
afterEach(() => vi.restoreAllMocks());

describe("useGeneration", () => {
  it("does nothing without an instruction", async () => {
    const s = spec();
    const { result } = renderHook(() => useGeneration(panel(), s, { model: "m", instruction: "  " }, settings));
    await act(() => result.current.generate());
    expect(s.generate).not.toHaveBeenCalled();
  });

  it("sends the trimmed instruction and references, then stores the output and an auto name in one step", async () => {
    const commit = vi.spyOn(canvasHistory, "commit");
    useKonvaNodes.setState({ nodes: { k: { id: "k", canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, imageUrl: "blob:k", label: "fox" } } });
    useConnectionStore.setState({ connections: [{ id: "w", fromNodeId: "k", fromNodeType: "konva", toNodeId: "a", toNodeType: "panel" }] });
    const s = spec();
    const { result } = renderHook(() => useGeneration(panel(), s, draft, settings));
    await act(() => result.current.generate());
    const args = (s.generate as ReturnType<typeof vi.fn>).mock.calls[0][0] as GenerateArgs;
    expect(args).toMatchObject({ modelId: "m", instruction: "a red fox in snow", references: [{ kind: "image", url: "blob:k", name: "fox" }] });
    expect(stored()).toMatchObject({ output: { type: "image", value: "data:out" }, label: "a red fox in snow", labelAuto: true });
    // The draft is saved before the request.
    expect(stored().draft).toEqual({ ...draft, settings });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(false);
  });

  it("keeps a name the user chose (#130)", async () => {
    useNodePanel.setState({ panels: [panel({ label: "hero", labelAuto: false })] });
    const { result } = renderHook(() => useGeneration(panel(), spec(), draft, settings));
    await act(() => result.current.generate());
    expect(stored().label).toBe("hero");
  });

  it("surfaces a failure and drops the job", async () => {
    useNodePanel.setState({ panels: [panel({ job: "j1" })] });
    const s = spec({ generate: vi.fn(async () => { throw new Error("quota"); }) });
    const { result } = renderHook(() => useGeneration(panel(), s, draft, settings));
    await act(() => result.current.generate());
    expect(result.current.error).toBe("quota");
    expect(stored().job).toBeUndefined();
  });

  it("persists the job id as soon as the backend hands it back", async () => {
    const s = spec({
      generate: vi.fn(async ({ onJobStarted }: GenerateArgs) => {
        onJobStarted?.("j9");
        expect(stored().job).toBe("j9");
        return { type: "video", value: "https://v" } as PanelOutput;
      }),
    });
    const { result } = renderHook(() => useGeneration(panel(), s, draft, settings));
    await act(() => result.current.generate());
    // An arriving result ends the job.
    expect(stored()).toMatchObject({ job: undefined, output: { type: "video" } });
  });

  it("aborts the request when the node unmounts, and writes nothing", async () => {
    let signal: AbortSignal | undefined;
    let finish: (o: PanelOutput) => void = () => {};
    const s = spec({
      generate: vi.fn((args: GenerateArgs) => {
        signal = args.signal;
        return new Promise<PanelOutput>((r) => { finish = r; });
      }),
    });
    const { result, unmount } = renderHook(() => useGeneration(panel(), s, draft, settings));
    let pending!: Promise<void>;
    act(() => { pending = result.current.generate(); });
    // Upstream nodes are resolved first (#11), so the request starts a tick later.
    await waitFor(() => expect(s.generate).toHaveBeenCalled());
    unmount();
    expect(signal?.aborted).toBe(true);
    finish({ type: "image", value: "late" });
    await pending;
    expect(stored().output).toBeUndefined();
  });

  it("lays a variants batch out in a new frame and selects it", async () => {
    const commit = vi.spyOn(canvasHistory, "commit");
    const s = spec({
      variantCount: () => 3,
      generateVariants: vi.fn(async () => ({ urls: ["u1", "u2", "u3"], failed: 0 })),
    });
    const { result } = renderHook(() => useGeneration(panel(), s, draft, settings));
    expect(result.current.busyLabel).toBe("Creating 3 images…");
    await act(() => result.current.generate());
    expect(s.generate).not.toHaveBeenCalled();
    const panels = useNodePanel.getState().panels;
    expect(panels.map((p) => p.output?.value)).toEqual(["u1", "u2", "u3"]);
    expect(panels.map((p) => p.label)).toEqual(["a red fox in snow", "a red fox in snow (2)", "a red fox in snow (3)"]);
    const frames = Object.values(useFrames.getState().frames);
    expect(frames).toHaveLength(1);
    expect(frames[0].label).toBe("a red fox in snow variants");
    expect(useFrames.getState().selectedIds).toEqual([frames[0].id]);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("says how many variants failed, and keeps the panel's selection", async () => {
    const s = spec({
      variantCount: () => 3,
      generateVariants: vi.fn(async () => ({ urls: ["u1", "u2"], failed: 1 })),
    });
    const { result } = renderHook(() => useGeneration(panel(), s, draft, settings));
    await act(() => result.current.generate());
    expect(result.current.error).toBe("1 of 3 variants failed to generate.");
    expect(useFrames.getState().selectedIds).toEqual([]);
  });

  it("resumes a job left running before a reload", async () => {
    useNodePanel.setState({ panels: [panel({ job: "j1" })] });
    const resume = vi.fn(async () => ({ type: "video", value: "https://v" }) as PanelOutput);
    const s = spec({ resume });
    const { result } = renderHook(() => useGeneration(panel({ job: "j1" }), s, draft, settings));
    expect(result.current.busy).toBe(true);
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(resume).toHaveBeenCalledWith("j1", expect.any(AbortSignal));
    expect(stored().output).toEqual({ type: "video", value: "https://v" });
  });

  it("drops a resumed job that failed", async () => {
    useNodePanel.setState({ panels: [panel({ job: "j1" })] });
    const s = spec({ resume: vi.fn(async () => { throw new Error("gone"); }) });
    const { result } = renderHook(() => useGeneration(panel({ job: "j1" }), s, draft, settings));
    await waitFor(() => expect(result.current.error).toBe("gone"));
    expect(stored().job).toBeUndefined();
  });
});

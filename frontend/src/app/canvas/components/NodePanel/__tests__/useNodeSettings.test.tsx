// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { useFrames } from "@/store/frame.store";
import { canvasHistory } from "@/lib/canvas/history";
import { useNodeSettings } from "../hooks/useNodeSettings";
import type { ImageSettings, NodeKindSpec } from "../nodeKinds";

const defaults: ImageSettings = { aspectRatio: "16:9", quality: "1K", thinking: "Minimal", temperature: 0, variants: 1 };
const spec = {
  defaultSettings: defaults,
  sizeFor: (s: ImageSettings) => (s.aspectRatio === "1:1" ? { w: 200, h: 200 } : { w: 320, h: 180 }),
} as unknown as NodeKindSpec;
const draft = { model: "m", instruction: "a cat" };

const panel = (over: Partial<PanelInstance> = {}): PanelInstance =>
  ({ id: "a", kind: "image", canvasX: 0, canvasY: 90, w: 320, h: 180, isActive: false, isPanelOpen: false, ...over }) as PanelInstance;

const stored = () => useNodePanel.getState().panels[0];

beforeEach(() => {
  useNodePanel.setState({ panels: [panel()] });
  useFrames.setState({ frames: {} });
});
afterEach(() => vi.restoreAllMocks());

describe("useNodeSettings", () => {
  it("starts from the defaults, overlaid with the node's own settings", () => {
    const { result } = renderHook(() =>
      useNodeSettings(panel({ draft: { ...draft, settings: { temperature: 1.2 } as never } }), spec, draft));
    expect(result.current.settings).toEqual({ ...defaults, temperature: 1.2 });
  });

  it("writes a change to the store with the draft, as one undo step", () => {
    const commit = vi.spyOn(canvasHistory, "commit");
    const { result } = renderHook(() => useNodeSettings(stored(), spec, draft));
    act(() => result.current.setSettings({ ...defaults, quality: "2K" }));
    expect((result.current.settings as ImageSettings).quality).toBe("2K");
    expect(stored().draft).toEqual({ ...draft, settings: { ...defaults, quality: "2K" } });
    expect(commit).toHaveBeenCalledWith(undefined);
  });

  it("resizes the node when the footprint changes (#129)", () => {
    const { result } = renderHook(() => useNodeSettings(stored(), spec, draft));
    act(() => result.current.setSettings({ ...defaults, aspectRatio: "1:1" }));
    expect(stored()).toMatchObject({ w: 200, h: 200 });
  });

  it("coalesces a slider's changes per field, but not choices", () => {
    const commit = vi.spyOn(canvasHistory, "commit");
    const { result } = renderHook(() => useNodeSettings(stored(), spec, draft));
    act(() => result.current.setSettings({ ...defaults, temperature: 0.1 }));
    act(() => result.current.setSettings({ ...defaults, temperature: 0.2 }));
    act(() => result.current.setSettings({ ...defaults, temperature: 0.2, variants: 3 }));
    const keys = commit.mock.calls.map(([k]) => k);
    expect(keys[0]).toBeTypeOf("object");
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).toBeTypeOf("object");
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("follows the store when undo puts the draft back", () => {
    const { result, rerender } = renderHook((p: PanelInstance) => useNodeSettings(p, spec, draft), {
      initialProps: panel({ draft: { ...draft, settings: { ...defaults, quality: "4K" } } }),
    });
    expect((result.current.settings as ImageSettings).quality).toBe("4K");
    // No draft at all is the node nobody edited: back to the defaults.
    rerender(panel());
    expect(result.current.settings).toEqual(defaults);
  });
});

// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useFrames } from "@/store/frame.store";
import { useNodeDraft } from "../hooks/useNodeDraft";
import type { NodeKindSpec } from "../nodeKinds";

// A node's draft and the name seeded from it (#468).

const spec = {
  models: [{ id: "first" }, { id: "second" }],
  defaultSettings: { temperature: 0 },
  sizeFor: () => ({ w: 320, h: 180 }),
} as unknown as NodeKindSpec;

const panel = (over: Partial<PanelInstance> = {}): PanelInstance =>
  ({ id: "a", kind: "image", canvasX: 0, canvasY: 90, w: 320, h: 180, ...over }) as PanelInstance;

const stored = (id = "a") => useNodePanel.getState().panels.find((p) => p.id === id)!;

beforeEach(() => {
  useNodePanel.setState({ panels: [panel()] });
  useKonvaNodes.setState({ nodes: {} });
  useFrames.setState({ frames: {} });
});

describe("useNodeDraft (#468)", () => {
  it("starts from the kind's default model, or the first one", () => {
    expect(renderHook(() => useNodeDraft(stored(), spec)).result.current.draft).toEqual({ model: "first", instruction: "" });
    const withDefault = { ...spec, defaultModel: "second" } as NodeKindSpec;
    expect(renderHook(() => useNodeDraft(stored(), withDefault)).result.current.draft.model).toBe("second");
  });

  it("saves a new draft with the node's settings", () => {
    const { result } = renderHook(() => useNodeDraft(stored(), spec));
    act(() => result.current.setDraft({ model: "second", instruction: "a red shoe" }));
    expect(stored().draft).toEqual({ model: "second", instruction: "a red shoe", settings: { temperature: 0 } });
  });

  it("names an unnamed node from its instruction when the field loses focus", () => {
    useNodePanel.setState({ panels: [panel({ draft: { model: "first", instruction: "a red running shoe" } })] });
    const { result } = renderHook(() => useNodeDraft(stored(), spec));
    act(() => result.current.commitInstruction());
    expect(stored().label).toBe("a red running shoe");
    expect(stored().draft?.instruction).toBe("a red running shoe");
  });

  it("keeps names unique across nodes", () => {
    useNodePanel.setState({
      panels: [
        panel({ id: "a", label: "a red shoe" }),
        panel({ id: "b", draft: { model: "first", instruction: "a red shoe" } }),
      ],
    });
    const { result } = renderHook(() => useNodeDraft(stored("b"), spec));
    act(() => result.current.commitInstruction());
    expect(stored("b").label).not.toBe("a red shoe");
    expect(stored("b").label).toMatch(/^a red shoe/);
  });

  it("never renames a named node, and doesn't name one from a blank instruction", () => {
    useNodePanel.setState({
      panels: [
        panel({ id: "a", label: "Hero", draft: { model: "first", instruction: "something else" } }),
        panel({ id: "b", draft: { model: "first", instruction: "   " } }),
      ],
    });
    const a = renderHook(() => useNodeDraft(stored("a"), spec)).result;
    const b = renderHook(() => useNodeDraft(stored("b"), spec)).result;
    act(() => a.current.commitInstruction());
    act(() => b.current.commitInstruction());
    expect(stored("a").label).toBe("Hero");
    expect(stored("b").label).toBeFalsy();
  });
});

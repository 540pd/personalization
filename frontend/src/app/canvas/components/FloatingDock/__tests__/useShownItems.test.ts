// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useToolStore } from "@/store/tool.store";
import { useSettings } from "@/store/settings.store";
import { DEFAULT_SETTINGS } from "@/app/canvas/settings/settings";
import { useShownItems } from "../useShownItems";

beforeEach(() => {
  useSettings.setState({ settings: { ...DEFAULT_SETTINGS } });
  useToolStore.setState({ activeTool: "pointer", lastShape: "rect" });
});
afterEach(cleanup);

describe("useShownItems (#404)", () => {
  it("offers the defaults: Image, Prompt and Compose; Rectangle, Arrow and Diamond", () => {
    const { result } = renderHook(() => useShownItems());
    expect(result.current.createItems.map((i) => i.label)).toEqual(["Image", "Prompt", "Compose"]);
    expect(result.current.shapeItems.map((i) => i.label)).toEqual(["Rectangle", "Arrow", "Diamond"]);
  });

  it("follows a change in Settings, keeping each menu's order and Image always", () => {
    const { result } = renderHook(() => useShownItems());
    act(() => {
      useSettings.setState({
        settings: { ...DEFAULT_SETTINGS, showVideo: true, showPrompt: false, showCompose: false, showRect: false, showLine: true },
      });
    });
    expect(result.current.createItems.map((i) => i.label)).toEqual(["Video", "Image"]);
    expect(result.current.shapeItems.map((i) => i.label)).toEqual(["Arrow", "Line", "Diamond"]);
  });

  it("returns to the pointer when the armed tool is hidden, and leaves a shown one armed", () => {
    useToolStore.setState({ activeTool: "shape-arrow" });
    renderHook(() => useShownItems());
    act(() => useSettings.setState({ settings: { ...DEFAULT_SETTINGS, showRect: false } }));
    expect(useToolStore.getState().activeTool).toBe("shape-arrow");
    act(() => useSettings.setState({ settings: { ...DEFAULT_SETTINGS, showArrow: false } }));
    expect(useToolStore.getState().activeTool).toBe("pointer");
  });
});

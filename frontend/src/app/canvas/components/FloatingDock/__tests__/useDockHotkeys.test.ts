// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useToolStore } from "@/store/tool.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { useSection } from "@/store/section.store";
import { useDockHotkeys } from "../useDockHotkeys";

const keyCodes: Record<string, number> = { v: 86, f: 70, t: 84, r: 82, a: 65, l: 76, o: 79, s: 83, u: 85, Escape: 27 };

function press(key: string, mods: Partial<KeyboardEventInit> = {}, target: EventTarget = document.body) {
  const init = { key, keyCode: keyCodes[key], bubbles: true, cancelable: true, ...mods };
  target.dispatchEvent(new KeyboardEvent("keydown", init));
  target.dispatchEvent(new KeyboardEvent("keyup", init));
}

function setup() {
  const closeMenus = vi.fn();
  const openFilePicker = vi.fn();
  const hook = renderHook(() => useDockHotkeys(closeMenus, openFilePicker));
  return { closeMenus, openFilePicker, ...hook };
}

beforeEach(() => {
  useSection.getState().setSection("playspace");
  useToolStore.setState({ activeTool: "pointer", lastShape: "rect" });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useDockHotkeys", () => {
  it("arms Frame, Text and each shape by its letter", () => {
    setup();
    press("f");
    expect(useToolStore.getState().activeTool).toBe("frame");
    press("t");
    expect(useToolStore.getState().activeTool).toBe("text");
    press("o");
    expect(useToolStore.getState().activeTool).toBe("shape-ellipse");
    press("v");
    expect(useToolStore.getState().activeTool).toBe("pointer");
  });

  it("brings back the last shape on S", () => {
    setup();
    press("a");
    press("v");
    press("s");
    expect(useToolStore.getState().activeTool).toBe("shape-arrow");
  });

  it("leaves a modified letter alone", () => {
    setup();
    press("r", { ctrlKey: true });
    expect(useToolStore.getState().activeTool).toBe("pointer");
  });

  it("closes the menus and panels and returns to the pointer on Escape", () => {
    const closeAllPanels = vi.fn();
    useNodePanel.setState({ closeAllPanels });
    const { closeMenus } = setup();
    useToolStore.setState({ activeTool: "frame" });
    press("Escape");
    expect(useToolStore.getState().activeTool).toBe("pointer");
    expect(closeMenus).toHaveBeenCalledTimes(1);
    expect(closeAllPanels).toHaveBeenCalledTimes(1);
  });

  it("opens the file picker on Ctrl+U", () => {
    const { openFilePicker } = setup();
    press("u", { ctrlKey: true });
    expect(openFilePicker).toHaveBeenCalledTimes(1);
  });

  it("ignores keys typed in a field or while another page is shown", () => {
    setup();
    const input = document.createElement("input");
    document.body.appendChild(input);
    press("f", {}, input);
    expect(useToolStore.getState().activeTool).toBe("pointer");
    input.remove();

    useSection.getState().setSection("skills");
    press("f");
    expect(useToolStore.getState().activeTool).toBe("pointer");
  });

  it("unbinds on unmount", () => {
    const { unmount } = setup();
    unmount();
    press("f");
    expect(useToolStore.getState().activeTool).toBe("pointer");
  });
});

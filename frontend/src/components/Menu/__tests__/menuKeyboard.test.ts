// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { KeyboardEvent } from "react";
import { stepIndex, menuKeyboard } from "../menuKeyboard";

describe("stepIndex", () => {
  it("moves one item and wraps at both ends", () => {
    expect(stepIndex(0, 3, 1)).toBe(1);
    expect(stepIndex(2, 3, 1)).toBe(0);
    expect(stepIndex(0, 3, -1)).toBe(2);
  });

  it("goes to the first item down from none focused", () => {
    expect(stepIndex(-1, 3, 1)).toBe(0);
  });
});

const key = (k: string) =>
  ({ key: k, stopPropagation: vi.fn(), preventDefault: vi.fn() }) as unknown as KeyboardEvent;

describe("menuKeyboard", () => {
  function setup() {
    const menu = document.createElement("div");
    menu.innerHTML =
      '<button role="menuitem">A</button><button role="menuitem" disabled>B</button><button role="menuitem">C</button>';
    document.body.replaceChildren(menu);
    const onClose = vi.fn();
    return { menu, onClose, onKeyDown: menuKeyboard({ current: menu }, onClose) };
  }

  it("Escape closes and restores focus; Tab closes without", () => {
    const { onKeyDown, onClose } = setup();
    onKeyDown(key("Escape"));
    expect(onClose).toHaveBeenLastCalledWith(true);
    onKeyDown(key("Tab"));
    expect(onClose).toHaveBeenLastCalledWith(false);
  });

  it("arrows skip disabled items and wrap", () => {
    const { menu, onKeyDown } = setup();
    const [a, , c] = Array.from(menu.querySelectorAll("button"));
    a.focus();
    onKeyDown(key("ArrowDown"));
    expect(document.activeElement).toBe(c);
    onKeyDown(key("ArrowDown"));
    expect(document.activeElement).toBe(a);
    onKeyDown(key("ArrowUp"));
    expect(document.activeElement).toBe(c);
  });
});

// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { KeyboardEvent, MouseEvent } from "react";
import { trapStep, modalKeys } from "../modalKeys";

describe("trapStep", () => {
  const els = ["a", "b", "c"];

  it("wraps Tab from the last to the first, and Shift+Tab from the first to the last", () => {
    expect(trapStep(els, "c", false)).toBe("a");
    expect(trapStep(els, "a", true)).toBe("c");
  });

  it("leaves every other move to the browser", () => {
    expect(trapStep(els, "a", false)).toBeNull();
    expect(trapStep(els, "b", true)).toBeNull();
    expect(trapStep([], "a", false)).toBeNull();
  });
});

const key = (k: string, shiftKey = false) =>
  ({ key: k, shiftKey, stopPropagation: vi.fn(), preventDefault: vi.fn() }) as unknown as KeyboardEvent;

describe("modalKeys", () => {
  function setup() {
    const root = document.createElement("div");
    root.innerHTML = "<button>One</button><input /><button>Two</button>";
    document.body.replaceChildren(root);
    const onClose = vi.fn();
    return { root, onClose, keys: modalKeys({ current: root }, onClose) };
  }

  it("stops every key, and closes on Escape", () => {
    const { keys, onClose } = setup();
    const e = key("x");
    keys.onKeyDown(e);
    expect(e.stopPropagation).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    keys.onKeyDown(key("Escape"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps Tab among the focusable elements", () => {
    const { root, keys } = setup();
    const [one, two] = Array.from(root.querySelectorAll("button"));
    two.focus();
    const e = key("Tab");
    keys.onKeyDown(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(document.activeElement).toBe(one);
    keys.onKeyDown(key("Tab", true));
    expect(document.activeElement).toBe(two);
  });

  it("closes on a press on the backdrop itself, not inside it", () => {
    const { root, keys, onClose } = setup();
    keys.onBackdropMouseDown({ target: root.firstChild, currentTarget: root } as unknown as MouseEvent);
    expect(onClose).not.toHaveBeenCalled();
    keys.onBackdropMouseDown({ target: root, currentTarget: root } as unknown as MouseEvent);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

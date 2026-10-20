// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useDismiss, type DismissOptions } from "../useDismiss";

const inside = document.createElement("div");
const child = document.createElement("span");
inside.appendChild(child);
const outside = document.createElement("div");
document.body.append(inside, outside);

const press = (el: Element) => el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
const key = (k: string) => {
  const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
  window.dispatchEvent(e);
  return e;
};

function setup(open: boolean, opts?: DismissOptions) {
  const onClose = vi.fn();
  const hook = renderHook(({ open }) => useDismiss(open, [{ current: inside }], onClose, opts), {
    initialProps: { open },
  });
  return { onClose, ...hook };
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("useDismiss", () => {
  it("closes on a press outside, not on one inside", () => {
    const { onClose } = setup(true);
    press(child);
    expect(onClose).not.toHaveBeenCalled();
    press(outside);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("listens only while open", () => {
    const { onClose, rerender } = setup(false);
    press(outside);
    expect(onClose).not.toHaveBeenCalled();
    rerender({ open: true });
    press(outside);
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender({ open: false });
    press(outside);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("accepts a getter for an element found at press time", () => {
    const onClose = vi.fn();
    renderHook(() => useDismiss(true, [() => child.parentElement], onClose));
    press(inside);
    expect(onClose).not.toHaveBeenCalled();
    press(outside);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores Escape unless asked", () => {
    const { onClose } = setup(true);
    key("Escape");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape, letting it through with bubble", () => {
    const { onClose } = setup(true, { escape: "bubble" });
    const later = vi.fn();
    window.addEventListener("keydown", later);
    key("a");
    expect(onClose).not.toHaveBeenCalled();
    key("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(later).toHaveBeenCalledTimes(2);
    window.removeEventListener("keydown", later);
  });

  it("claims Escape before a later handler sees it", () => {
    const { onClose } = setup(true, { escape: "claim" });
    const later = vi.fn();
    window.addEventListener("keydown", later);
    key("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(later).not.toHaveBeenCalled();
    window.removeEventListener("keydown", later);
  });

  it("calls the latest onClose without re-registering", () => {
    const first = vi.fn();
    const second = vi.fn();
    const add = vi.spyOn(document, "addEventListener");
    const { rerender } = renderHook(({ cb }) => useDismiss(true, [{ current: inside }], cb), {
      initialProps: { cb: first },
    });
    rerender({ cb: second });
    expect(add.mock.calls.filter(([t]) => t === "mousedown")).toHaveLength(1);
    press(outside);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stops listening on unmount", () => {
    const { onClose, unmount } = setup(true, { escape: "claim" });
    unmount();
    press(outside);
    key("Escape");
    expect(onClose).not.toHaveBeenCalled();
  });
});

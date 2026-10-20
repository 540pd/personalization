// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { trackPointer } from "../pointer";

// jsdom has no PointerEvent constructor; a MouseEvent of the same type is
// what the listeners receive.
const fire = (type: string) => window.dispatchEvent(new MouseEvent(type));

describe("trackPointer (#250)", () => {
  it("follows moves until the release, then stops", () => {
    const onMove = vi.fn();
    const onUp = vi.fn();
    trackPointer({ onMove, onUp });
    fire("pointermove");
    fire("pointerup");
    fire("pointermove");
    fire("pointerup");
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onUp).toHaveBeenCalledTimes(1);
  });

  it.each(["pointercancel", "blur"])("%s cancels: onCancel, not onUp, and no more moves", (type) => {
    const onMove = vi.fn();
    const onUp = vi.fn();
    const onCancel = vi.fn();
    trackPointer({ onMove, onUp, onCancel });
    fire(type);
    fire("pointermove");
    fire("pointerup");
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onUp).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
  });

  it("the returned stop ends it with neither handler, and is safe to call twice", () => {
    const onUp = vi.fn();
    const onCancel = vi.fn();
    const stop = trackPointer({ onUp, onCancel });
    stop();
    stop();
    fire("pointerup");
    fire("pointercancel");
    expect(onUp).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});

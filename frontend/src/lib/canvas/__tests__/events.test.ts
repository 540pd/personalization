// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { canvasEvent } from "../events";

describe("canvasEvent (#251)", () => {
  it("hands every listener the detail and the same event, until it stops", () => {
    const ev = canvasEvent<{ hex: string }>("test:color");
    const a = vi.fn();
    const b = vi.fn();
    const stopA = ev.on(a);
    const stopB = ev.on(b);
    ev.emit({ hex: "#fff" });
    expect(a).toHaveBeenCalledWith({ hex: "#fff" }, expect.any(Event));
    expect(a.mock.calls[0][1]).toBe(b.mock.calls[0][1]);
    stopA();
    ev.emit({ hex: "#000" });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
    stopB();
  });

  it("an event with no detail is emitted with none", () => {
    const ev = canvasEvent("test:clear");
    const h = vi.fn();
    const stop = ev.on(h);
    ev.emit();
    expect(h).toHaveBeenCalledTimes(1);
    stop();
  });
});

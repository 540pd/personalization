// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDeferredFlush, warnOnce, writeWithLeanFallback } from "../storage";

/** A localStorage that throws past `quota` characters, as a browser does. */
function quotaStorage(quota: number): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() { return data.size; },
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    removeItem: (k) => { data.delete(k); },
    setItem: (k, v) => {
      if (v.length > quota) throw new DOMException("over quota", "QuotaExceededError");
      data.set(k, v);
    },
  };
}

describe("warnOnce", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { warn = vi.spyOn(console, "warn").mockImplementation(() => {}); });
  afterEach(() => warn.mockRestore());

  it("warns the first time only, with its tag", () => {
    const log = warnOnce("[t]");
    log("one");
    log("two");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("[t] one");
  });

  it("each logger has its own once", () => {
    warnOnce("[a]")("x");
    warnOnce("[b]")("y");
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe("writeWithLeanFallback", () => {
  const messages = (log = vi.fn()) => ({ log, lean: "lean", failed: "failed" });
  const full = { image: "x".repeat(200), text: "kept" };
  const lean = () => ({ text: "kept" });

  it("writes the full value when it fits, and says nothing", () => {
    const storage = quotaStorage(1000);
    const warn = messages();
    expect(writeWithLeanFallback(storage, "k", full, lean, warn)).toBe("full");
    expect(JSON.parse(storage.getItem("k")!)).toEqual(full);
    expect(warn.log).not.toHaveBeenCalled();
  });

  it("writes the lean value when the full one is over quota", () => {
    const storage = quotaStorage(100);
    const warn = messages();
    expect(writeWithLeanFallback(storage, "k", full, lean, warn)).toBe("lean");
    expect(JSON.parse(storage.getItem("k")!)).toEqual({ text: "kept" });
    expect(warn.log).toHaveBeenCalledWith("lean");
  });

  it("builds the lean value only when it is needed", () => {
    const build = vi.fn(lean);
    writeWithLeanFallback(quotaStorage(1000), "k", full, build, messages());
    expect(build).not.toHaveBeenCalled();
  });

  it("gives up without throwing when nothing fits", () => {
    const storage = quotaStorage(5);
    const warn = messages();
    expect(() => writeWithLeanFallback(storage, "k", full, lean, warn)).not.toThrow();
    expect(writeWithLeanFallback(storage, "k", full, lean, warn)).toBe("failed");
    expect(storage.data.has("k")).toBe(false);
    expect(warn.log).toHaveBeenCalledWith("failed");
  });
});

describe("createDeferredFlush", () => {
  let disposers: Array<() => void> = [];
  const make = (write: () => void, delay = 150) => {
    const d = createDeferredFlush(write, delay);
    disposers.push(d.dispose);
    return d;
  };
  const hide = (state: "hidden" | "visible") => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
    document.dispatchEvent(new Event("visibilitychange"));
  };

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    disposers.forEach((d) => d());
    disposers = [];
    vi.useRealTimers();
    // Back to jsdom's own getter.
    delete (document as unknown as Record<string, unknown>).visibilityState;
  });

  it("writes once changes pause, not on every schedule", () => {
    const write = vi.fn();
    const d = make(write);
    for (let i = 0; i < 10; i++) {
      d.schedule();
      vi.advanceTimersByTime(100);
    }
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("flush writes now and cancels the wait", () => {
    const write = vi.fn();
    const d = make(write);
    d.schedule();
    d.flush();
    expect(write).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(500);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("writes at once on pagehide", () => {
    const write = vi.fn();
    make(write).schedule();
    window.dispatchEvent(new Event("pagehide"));
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("writes at once when the page is hidden, not when it is shown", () => {
    const write = vi.fn();
    make(write);
    hide("visible");
    expect(write).not.toHaveBeenCalled();
    hide("hidden");
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("stops listening once disposed", () => {
    const write = vi.fn();
    make(write).dispose();
    window.dispatchEvent(new Event("pagehide"));
    hide("hidden");
    expect(write).not.toHaveBeenCalled();
  });
});

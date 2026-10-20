import { describe, it, expect, vi, afterEach } from "vitest";
import { sleep } from "../sleep";

afterEach(() => vi.useRealTimers());

describe("sleep", () => {
  it("resolves after the delay", async () => {
    vi.useFakeTimers();
    const done = vi.fn();
    sleep(2000).then(done);
    await vi.advanceTimersByTimeAsync(1999);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalled();
  });

  it("removes its abort listener when the timer fires", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    for (let i = 0; i < 3; i++) {
      const p = sleep(10, controller.signal);
      await vi.advanceTimersByTimeAsync(10);
      await p;
    }
    expect(add).toHaveBeenCalledTimes(3);
    expect(remove).toHaveBeenCalledTimes(3);
    expect(remove.mock.calls.map((c) => c[1])).toEqual(add.mock.calls.map((c) => c[1]));
  });

  it("rejects with an AbortError the moment the signal aborts", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const p = sleep(60_000, controller.signal);
    controller.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects at once on a signal that already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(sleep(10, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});

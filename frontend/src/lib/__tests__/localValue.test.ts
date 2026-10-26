import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localValue } from "../localValue";
import { localList } from "../localList";

function memoryStorage({ failWrites = false, failReads = false } = {}): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() { return data.size; },
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => {
      if (failReads) throw new Error("denied");
      return data.get(k) ?? null;
    },
    removeItem: (k) => { data.delete(k); },
    setItem: (k, v) => {
      if (failWrites) throw new DOMException("quota", "QuotaExceededError");
      data.set(k, v);
    },
  };
}

const count = () =>
  localValue<number>({
    key: "k",
    field: "count",
    version: 2,
    tag: "[t]",
    fallback: () => 0,
    read: (raw) => {
      if (typeof raw !== "number") throw new Error("not a number");
      return raw;
    },
  });

describe("localValue", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { warn = vi.spyOn(console, "warn").mockImplementation(() => {}); });
  afterEach(() => warn.mockRestore());

  it("stores {version, [field]: value} and reads it back", () => {
    const storage = memoryStorage();
    const v = count();
    expect(v.save(7, storage)).toBe(true);
    expect(JSON.parse(storage.data.get("k")!)).toEqual({ version: 2, count: 7 });
    expect(v.load(storage)).toBe(7);
  });

  it("is the fallback when nothing is saved, quietly", () => {
    expect(count().load(memoryStorage())).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it("is the fallback for another version, bad JSON or an unreadable value, and leaves the entry", () => {
    for (const text of [JSON.stringify({ version: 1, count: 7 }), "{nope", "null", JSON.stringify({ version: 2, count: "x" })]) {
      const storage = memoryStorage();
      storage.data.set("k", text);
      expect(count().load(storage)).toBe(0);
      expect(storage.data.get("k")).toBe(text);
    }
    expect(warn).toHaveBeenCalledWith("[t] The saved count are unreadable and were ignored.", expect.any(Error));
  });

  it("never throws: a refused read is the fallback, a refused write is false", () => {
    const v = count();
    expect(v.load(memoryStorage({ failReads: true }))).toBe(0);
    expect(v.save(1, memoryStorage({ failWrites: true }))).toBe(false);
    expect(v.save(1, undefined as unknown as Storage)).toBe(false);
  });

  it("warns about a refused write once", () => {
    const v = count();
    v.save(1, memoryStorage({ failWrites: true }));
    v.save(2, memoryStorage({ failWrites: true }));
    expect(warn.mock.calls.filter(([m]) => String(m).includes("could not be saved"))).toHaveLength(1);
  });
});

describe("localList on localValue", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { warn = vi.spyOn(console, "warn").mockImplementation(() => {}); });
  afterEach(() => warn.mockRestore());

  const names = () =>
    localList<string>({
      key: "names", field: "names", version: 1, tag: "[n]",
      readItem: (raw) => (typeof raw === "string" ? raw : null),
    });

  it("keeps the stored format", () => {
    const storage = memoryStorage();
    names().save(["a", "b"], storage);
    expect(JSON.parse(storage.data.get("names")!)).toEqual({ version: 1, names: ["a", "b"] });
  });

  it("skips entries it cannot read, and keeps the rest", () => {
    const storage = memoryStorage();
    storage.data.set("names", JSON.stringify({ version: 1, names: ["a", 3, "b"] }));
    expect(names().load(storage)).toEqual(["a", "b"]);
    expect(warn).toHaveBeenCalledWith("[n] Skipped saved names that could not be read.");
  });

  it("is empty when the field is not a list", () => {
    const storage = memoryStorage();
    storage.data.set("names", JSON.stringify({ version: 1, names: "a" }));
    expect(names().load(storage)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { inside, readAllJson, readJson, writeAtomic } from "../localDisk.js";

// The local-disk placeholder's file handling (#333).

const dir = () => mkdtempSync(path.join(tmpdir(), "gcos-disk-"));

describe("localDisk", () => {
  it("refuses a name that would leave the directory", () => {
    for (const bad of ["../x.json", "a/b.json", "..", ".hidden", "x\\y", ""]) {
      expect(() => inside("/data", bad)).toThrow(/Unsafe/);
    }
    expect(inside("/data", "0b9f3c1e-2d4a.json")).toBe(path.join("/data", "0b9f3c1e-2d4a.json"));
  });

  it("writes whole files and leaves no temp file behind", async () => {
    const d = dir();
    const file = path.join(d, "nested", "a.json");
    await writeAtomic(file, '{"a":1}');
    await writeAtomic(file, '{"a":2}');
    expect(readFileSync(file, "utf8")).toBe('{"a":2}');
    expect(readdirSync(path.dirname(file))).toEqual(["a.json"]);
  });

  it("reads JSON back; a missing file or directory is empty, not an error", async () => {
    const d = dir();
    await writeAtomic(path.join(d, "a.json"), '{"n":1}');
    await writeAtomic(path.join(d, "b.bin"), "bytes");
    expect(await readJson(path.join(d, "a.json"))).toEqual({ n: 1 });
    expect(await readJson(path.join(d, "missing.json"))).toBeNull();
    expect(await readAllJson(d)).toEqual([{ n: 1 }]);
    expect(await readAllJson(path.join(d, "nope"))).toEqual([]);
  });
});

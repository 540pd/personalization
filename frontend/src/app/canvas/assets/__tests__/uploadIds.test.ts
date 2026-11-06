import { describe, expect, it } from "vitest";
import { newTempId, rekey, rekeySelected } from "../uploadIds";

// An upload's temporary id giving way to the stored one (#462).

describe("upload ids (#462)", () => {
  it("makes temporary ids that never repeat", () => {
    const a = newTempId();
    expect(a).toMatch(/^tmp-/);
    expect(newTempId()).not.toBe(a);
  });

  it("gives the stored id what the temporary one had, keeping both", () => {
    const sizes = { "tmp-1": { width: 10, height: 20 }, other: { width: 1, height: 1 } };
    expect(rekey(sizes, "tmp-1", "a1")).toEqual({ ...sizes, a1: { width: 10, height: 20 } });
  });

  it("leaves the record as it is when the temporary id has nothing", () => {
    const readings = { other: 1 };
    expect(rekey(readings, "tmp-1", "a1")).toBe(readings);
  });

  it("moves the selection only in groups where the upload was selected", () => {
    const sel = { productImage: "tmp-1", logo: "l1", reference: null };
    expect(rekeySelected(sel, "tmp-1", "a1")).toEqual({ productImage: "a1", logo: "l1", reference: null });
    expect(rekeySelected(sel, "tmp-9", "a9")).toBe(sel);
  });
});

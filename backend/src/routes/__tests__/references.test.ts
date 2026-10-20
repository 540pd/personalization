import { describe, expect, it } from "vitest";
import { readReferences } from "../references.js";

describe("readReferences", () => {
  it("is undefined for anything that is not a non-empty list of references", () => {
    expect(readReferences(undefined)).toBeUndefined();
    expect(readReferences("data:image/png;base64,AA")).toBeUndefined();
    expect(readReferences([])).toBeUndefined();
    expect(readReferences([null, 4, {}, { kind: "text" }, { url: "" }])).toBeUndefined();
  });

  it("reads the current discriminated shape", () => {
    expect(
      readReferences([
        { kind: "image", url: "data:image/png;base64,AA", name: "Helmet" },
        { kind: "text", text: "a quay at dusk", name: "Brief" },
      ])
    ).toEqual([
      { kind: "image", url: "data:image/png;base64,AA", name: "Helmet" },
      { kind: "text", text: "a quay at dusk", name: "Brief" },
    ]);
  });

  it("still reads the older { url, name } shape and a bare data-URL string", () => {
    expect(readReferences([{ url: "data:a", name: "Old" }, "data:b", ""])).toEqual([
      { kind: "image", url: "data:a", name: "Old" },
      { kind: "image", url: "data:b" },
    ]);
  });

  it("strips control characters from names and bounds them", () => {
    const [ref] = readReferences([{ url: "data:a", name: "  Hel\u0000met\u001F\n" + "x".repeat(100) }])!;
    expect(ref.name).toBe("Hel met  " + "x".repeat(51));
    expect(ref.name).toHaveLength(60);
  });

  it("drops a name that is blank once cleaned", () => {
    expect(readReferences([{ url: "data:a", name: "\u0007 " }])).toEqual([{ kind: "image", url: "data:a" }]);
  });

  it("keeps newlines in a text reference, strips other controls, and bounds it", () => {
    const [ref] = readReferences([{ kind: "text", text: "line one\nline\ttwo\u0000" }])!;
    expect(ref).toEqual({ kind: "text", text: "line one\nline two" });

    const [long] = readReferences([{ kind: "text", text: "y".repeat(5000) }])!;
    expect(long.kind === "text" && long.text).toHaveLength(4000);
  });

  it("drops a text reference that is blank once cleaned", () => {
    expect(readReferences([{ kind: "text", text: " \u0001 " }])).toBeUndefined();
  });
});

import { describe, it, expect } from "vitest";
import Konva from "konva";

// Guards the vitest configuration itself. Each of these failed before the
// config was fixed, and each failure was invisible because
// --passWithNoTests kept `npm test` green with no tests to fail.

describe("test harness", () => {
  it("has expect as a global, so the jest-dom setup can extend it", () => {
    // setupFiles calls expect.extend at module scope. Without globals: true
    // every test file in the repo dies before collection with
    // "expect is not defined" — including this one.
    expect(typeof expect.extend).toBe("function");
  });

  it("resolves konva to the browser build, not the native-canvas one", () => {
    // konva's "main" is ./lib/index-node.js, which does require("canvas").
    // Importing konva at all used to throw "Cannot find module 'canvas'".
    // Asserted via a constructor rather than Konva.version, which the browser
    // build does not declare on its type.
    expect(typeof Konva.Group).toBe("function");
  });

  it("exercises container-level Konva without any canvas", () => {
    // A Group is a Konva.Container with no canvas of its own, which is why
    // helpers should take Container rather than Layer: production passes the
    // real Layer, a test passes this.
    const g = new Konva.Group();
    const a = new Konva.Rect({ name: "selectable", id: "a", x: 0 });
    const b = new Konva.Rect({ name: "selectable", id: "b" });
    g.add(a);
    g.add(b);

    const ids = () => (g.find(".selectable") as Konva.Rect[]).map((n) => n.id()).join(",");
    expect(ids()).toBe("a,b");

    a.moveToTop();
    expect(ids()).toBe("b,a");

    const snapshot = { ...a.getAttrs() };
    a.setAttrs({ ...snapshot, x: 99 });
    expect(a.x()).toBe(99);
    a.setAttrs(snapshot);
    // a was created with an explicit x, so the key is present in the snapshot
    // and restoring it puts the value back. See the next test for what happens
    // when it is not.
    expect(a.x()).toBe(0);
  });

  it("setAttrs restores keys, it does not remove ones the snapshot lacks", () => {
    // A sharp edge for Board.tsx's snapshot undo, which does
    // `attrs: {...n.getAttrs()}` then `node.setAttrs(attrs)`. getAttrs only
    // returns keys that were actually set, so if a node gains an attribute
    // AFTER a snapshot, restoring that snapshot will not unset it.
    //
    // Harmless today only because Board creates every node with explicit
    // x/y. Anything relying on snapshot/restore must keep doing so — worth
    // pinning before board-03 moves that code.
    const n = new Konva.Rect({ name: "selectable" });
    const before = { ...n.getAttrs() };
    expect(before).not.toHaveProperty("x");

    n.x(42);
    n.setAttrs(before);
    expect(n.x()).toBe(42);   // not 0 — the key was never in the snapshot
  });

  it("cannot construct a Stage — the boundary that sends work to Playwright", () => {
    // Documented as a test so the limit is discovered here rather than
    // halfway through writing a spec that can never pass.
    expect(() => new Konva.Stage({ container: document.createElement("div") }))
      .toThrow();
  });
});

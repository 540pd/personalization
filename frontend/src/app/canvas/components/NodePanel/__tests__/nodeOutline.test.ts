import { describe, it, expect } from "vitest";
import { COLORS } from "@/constants/canvas.constants";
import { nodeOutline, nodeState } from "../nodeOutline";

describe("nodeState", () => {
  it("names the three states", () => {
    expect(nodeState(false, false)).toBe("unselected");
    expect(nodeState(true, false)).toBe("selected");
    expect(nodeState(true, true)).toBe("open");
  });
});

describe("nodeOutline", () => {
  it("keeps a selected node black, solid and flush, whether or not it is filled", () => {
    for (const filled of [false, true]) {
      expect(nodeOutline("selected", filled)).toEqual({ colour: COLORS.ink, line: "solid", gap: 0, linked: false });
    }
  });

  it("does not link an unselected node", () => {
    expect(nodeOutline("unselected", true).linked).toBe(false);
  });

  it("draws the open node in the accent, clear of its content", () => {
    const open = nodeOutline("open", true);
    expect(open.colour).toBe(COLORS.selected);
    expect(open.linked).toBe(true);
    expect(open.gap).toBeGreaterThan(0);
  });

  it("dashes the outline of an empty open node and keeps a filled one solid", () => {
    expect(nodeOutline("open", false).line).toBe("dashed");
    expect(nodeOutline("open", true).line).toBe("solid");
  });

  it("gives the open and selected states different colours", () => {
    expect(nodeOutline("open", true).colour).not.toBe(nodeOutline("selected", true).colour);
  });
});

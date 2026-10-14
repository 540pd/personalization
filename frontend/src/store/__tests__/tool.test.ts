import { describe, it, expect } from "vitest";
import { panningTool, cursorFor, type Tool } from "@/store/tool.store";

describe("panningTool", () => {
  it("is false for pointer, which selects rather than pans", () => {
    expect(panningTool("pointer")).toBe(false);
  });

  // The distinction that did not exist before Frame: every other non-pointer
  // tool pans, so "not pointer" used to be an accurate shorthand.
  it("is false for frame, which draws a region", () => {
    expect(panningTool("frame")).toBe(false);
  });

  it("is true for the tools that really do pan", () => {
    const panning: Tool[] = ["link-straight", "link-elbow", "link-curve", "shapes", "text"];
    panning.forEach((t) => expect(panningTool(t)).toBe(true));
  });
});

describe("cursorFor", () => {
  it("offers a crosshair for a draw tool", () => {
    expect(cursorFor("frame")).toBe("crosshair");
  });

  it("leaves everything else on the default", () => {
    expect(cursorFor("pointer")).toBe("default");
    expect(cursorFor("link-straight")).toBe("default");
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { boardKeyAllowed } from "../boardKeys";
import { useSection } from "@/store/section.store";

const keyOn = (target: EventTarget) => {
  const e = new KeyboardEvent("keydown");
  Object.defineProperty(e, "target", { value: target });
  return e;
};

afterEach(() => useSection.getState().setSection("playspace"));

describe("boardKeyAllowed (#249)", () => {
  it("a key on the board page, not in a field or dialog", () => {
    useSection.getState().setSection("playspace");
    expect(boardKeyAllowed(keyOn(document.body))).toBe(true);
    expect(boardKeyAllowed(keyOn(document.createElement("textarea")))).toBe(false);
  });

  it("never while another page covers the board", () => {
    useSection.getState().setSection("skills");
    expect(boardKeyAllowed(keyOn(document.body))).toBe(false);
  });
});

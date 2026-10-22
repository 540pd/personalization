import { afterEach, describe, expect, it, vi } from "vitest";
import { useSection, setLeaveGuard, boardIsShown } from "../section.store";

afterEach(() => {
  setLeaveGuard(null);
  useSection.setState({ section: "playspace" });
});

describe("section store", () => {
  it("moves between sections, and the board is shown only on playspace", () => {
    useSection.getState().setSection("brand");
    expect(useSection.getState().section).toBe("brand");
    expect(boardIsShown()).toBe(false);
    useSection.getState().setSection("playspace");
    expect(boardIsShown()).toBe(true);
  });

  it("asks the leave guard, which can hold the move and make it later", () => {
    useSection.getState().setSection("brand");
    let proceed: (() => void) | null = null;
    setLeaveGuard((go) => {
      proceed = go;
      return true;
    });
    useSection.getState().setSection("settings");
    expect(useSection.getState().section).toBe("brand");
    proceed!();
    expect(useSection.getState().section).toBe("settings");
  });

  it("goes straight on when the guard lets it", () => {
    setLeaveGuard(() => false);
    useSection.getState().setSection("skills");
    expect(useSection.getState().section).toBe("skills");
  });

  it("does not ask when staying where it is", () => {
    const guard = vi.fn(() => true);
    useSection.getState().setSection("brand");
    setLeaveGuard(guard);
    useSection.getState().setSection("brand");
    expect(guard).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { setLeaveGuard, useSection } from "@/store/section.store";
import { useLeaveGuard } from "../useLeaveGuard";

// The leave guard Brand and Assets share (#219, #462).

function Page({ dirty, onDiscard }: { dirty: boolean; onDiscard?: () => void }) {
  const confirm = useLeaveGuard(dirty, { name: "the assets", onDiscard });
  return (
    <>
      <input aria-label="field" />
      {confirm}
    </>
  );
}

const leave = () => act(() => useSection.getState().setSection("playspace"));

beforeEach(() => {
  setLeaveGuard(null);
  useSection.setState({ section: "assets", previous: null });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useLeaveGuard (#462)", () => {
  it("lets the page go while nothing is unsaved", () => {
    render(<Page dirty={false} />);
    leave();
    expect(useSection.getState().section).toBe("playspace");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("holds the move back and asks while dirty", () => {
    render(<Page dirty />);
    leave();
    expect(useSection.getState().section).toBe("assets");
    expect(screen.getByText("Your changes to the assets won't be saved.")).toBeTruthy();
  });

  it("stops guarding once clean again", () => {
    const { rerender } = render(<Page dirty />);
    rerender(<Page dirty={false} />);
    leave();
    expect(useSection.getState().section).toBe("playspace");
  });

  it("Discard cleans up, then makes the move, asked only once", () => {
    const order: string[] = [];
    const onDiscard = vi.fn(() => order.push(`discard in ${useSection.getState().section}`));
    render(<Page dirty onDiscard={onDiscard} />);
    leave();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(order).toEqual(["discard in assets"]);
    expect(useSection.getState().section).toBe("playspace");
    expect(screen.queryByText(/won't be saved/)).toBeNull();
  });

  it("Keep editing stays, and puts focus back where it was", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    render(<Page dirty />);
    const field = screen.getByLabelText("field");
    field.focus();
    leave();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(useSection.getState().section).toBe("assets");
    expect(screen.queryByText(/won't be saved/)).toBeNull();
    expect(document.activeElement).toBe(field);
  });

  it("asks the browser before a reload while dirty, not after", () => {
    const { rerender } = render(<Page dirty />);
    const before = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(true);
    rerender(<Page dirty={false} />);
    const after = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });
});

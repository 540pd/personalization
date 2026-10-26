// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import Tooltip from "..";

describe("Tooltip", () => {
  it("label: a dark bubble beside its child, hidden from screen readers", () => {
    const { container, getByRole } = render(
      <Tooltip content="Boards"><button aria-label="Boards">B</button></Tooltip>,
    );
    const anchor = container.firstElementChild!;
    expect(anchor.tagName).toBe("SPAN");
    expect(anchor.className).toBe("tooltip-anchor");
    const bubble = anchor.querySelector(".tooltip")!;
    expect(bubble.textContent).toBe("Boards");
    expect(bubble.getAttribute("aria-hidden")).toBe("true");
    // The button keeps its own name; the bubble adds nothing to it.
    expect(getByRole("button", { name: "Boards" })).toBeTruthy();
  });

  it("pill: the toolbar's anchor and bubble classes, in a div", () => {
    const { container } = render(
      <Tooltip variant="pill" className="floating-dock-tool-wrapper" bubbleClassName="floating-dock-tooltip" content="Frame">
        <button aria-label="Frame" />
      </Tooltip>,
    );
    const anchor = container.firstElementChild!;
    expect(anchor.tagName).toBe("DIV");
    expect(anchor.className).toBe("tooltip-anchor floating-dock-tool-wrapper");
    expect(anchor.querySelector(".tooltip-pill.floating-dock-tooltip")!.textContent).toBe("Frame");
    expect(anchor.querySelector(".tooltip")).toBeNull();
  });

  it("empty content shows no bubble but keeps the anchor and child", () => {
    const { container } = render(<Tooltip content=""><button /></Tooltip>);
    expect(container.querySelector(".tooltip-anchor button")).toBeTruthy();
    expect(container.querySelector(".tooltip")).toBeNull();
  });

  it("Escape dismisses it until the pointer or focus leaves", () => {
    const { container } = render(<Tooltip content="Hi"><button /></Tooltip>);
    const anchor = container.firstElementChild as HTMLElement;
    expect(anchor.dataset.dismissed).toBeUndefined();
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(anchor.dataset.dismissed).toBe("true");
    fireEvent.mouseLeave(anchor);
    expect(anchor.dataset.dismissed).toBeUndefined();
  });
});

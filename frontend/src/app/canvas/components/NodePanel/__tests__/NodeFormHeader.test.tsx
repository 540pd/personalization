// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NodeFormHeader from "../NodeFormHeader";

// Props only: no store, no kind spec, no Konva.

describe("NodeFormHeader", () => {
  it("shows the title as the form's heading", () => {
    render(<NodeFormHeader title="Create Image" onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Create Image" })).toBeTruthy();
  });

  it("shows the node's name, with the full name as its tooltip", () => {
    render(<NodeFormHeader title="Create Image" nodeName="jungle theme" onClose={vi.fn()} />);
    expect(screen.getByText("jungle theme").getAttribute("title")).toBe("jungle theme");
  });

  it("leaves out the name when there is none", () => {
    const { container } = render(<NodeFormHeader title="Create Image" onClose={vi.fn()} />);
    expect(container.querySelector(".node-form-header-name")).toBeNull();
  });

  it("closes from a button named Close", () => {
    const onClose = vi.fn();
    render(<NodeFormHeader title="Create Image" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders what it is given under the title", () => {
    render(
      <NodeFormHeader title="Create Image" onClose={vi.fn()}>
        <button type="button">Model A</button>
      </NodeFormHeader>,
    );
    expect(screen.getByRole("button", { name: "Model A" })).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import InstructionField from "../InstructionField";

// Props only. The @ behaviour is MentionInput's and has its own tests.

function setup(overrides: Partial<React.ComponentProps<typeof InstructionField>> = {}) {
  const props = {
    value: "",
    onChange: vi.fn(),
    onBlur: vi.fn(),
    placeholder: "Describe the image...",
    mentionables: { skills: [], agents: [] },
    known: [],
    ...overrides,
  };
  return { props, ...render(<InstructionField {...props} />) };
}

describe("InstructionField", () => {
  it("shows the label and the text area with its placeholder", () => {
    setup();
    expect(screen.getByText("Instruction")).toBeTruthy();
    expect(screen.getByPlaceholderText("Describe the image...")).toBeTruthy();
  });

  it("shows a caption beside the label only when given one", () => {
    const { container, rerender, props } = setup();
    expect(container.querySelector(".instruction-field-caption")).toBeNull();
    rerender(<InstructionField {...props} caption="@ for skills" />);
    expect(screen.getByText("@ for skills")).toBeTruthy();
  });

  it("reports what is typed and when the field is left", () => {
    const { props } = setup();
    const box = screen.getByPlaceholderText("Describe the image...");
    fireEvent.change(box, { target: { value: "a brass helmet" } });
    expect(props.onChange).toHaveBeenCalledWith("a brass helmet", undefined);
    fireEvent.blur(box);
    expect(props.onBlur).toHaveBeenCalledTimes(1);
  });

  it("lists the notes under the box, and nothing when there are none", () => {
    const { container, rerender, props } = setup();
    expect(container.querySelector(".mention-notes")).toBeNull();
    rerender(<InstructionField {...props} notes={["One agent per prompt: @planner is sent as text."]} />);
    expect(screen.getByText("One agent per prompt: @planner is sent as text.")).toBeTruthy();
  });

  it("keeps the class the text area is found by", () => {
    const { container } = setup();
    expect(container.querySelector("textarea.node-panel-instruction")).not.toBeNull();
  });
});

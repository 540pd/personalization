// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ModelField from "../ModelField";

// Props only: a list of models, the chosen one, and a callback.

const MODELS = [
  { id: "a", label: "Model A", hint: "Lowest cost." },
  { id: "b", label: "Model B" },
];

const trigger = () => screen.getByRole("button", { name: /Model/ });

describe("ModelField", () => {
  it("shows the chosen model in a button named after the field", () => {
    render(<ModelField models={MODELS} value="a" onChange={vi.fn()} />);
    expect(trigger().textContent).toBe("Model A");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });

  it("shows the chosen model's hint, and none for a model without one", () => {
    const { rerender, container } = render(<ModelField models={MODELS} value="a" onChange={vi.fn()} />);
    expect(screen.getByText("Lowest cost.")).toBeTruthy();
    rerender(<ModelField models={MODELS} value="b" onChange={vi.fn()} />);
    expect(container.querySelector(".model-field-hint")).toBeNull();
  });

  it("lists every model when opened, with the current one marked", () => {
    render(<ModelField models={MODELS} value="a" onChange={vi.fn()} />);
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.click(trigger());
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Model A", "Model B"]);
    expect(options.map((o) => o.getAttribute("aria-selected"))).toEqual(["true", "false"]);
  });

  it("reports the chosen id and closes", () => {
    const onChange = vi.fn();
    render(<ModelField models={MODELS} value="a" onChange={onChange} />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("option", { name: "Model B" }));
    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("closes on a press outside it", () => {
    render(<ModelField models={MODELS} value="a" onChange={vi.fn()} />);
    fireEvent.click(trigger());
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("says when the model comes from a mentioned agent", () => {
    render(<ModelField models={MODELS} value="b" onChange={vi.fn()} fromAgent="copywriter" />);
    expect(trigger().textContent).toBe("Model B · from @copywriter");
  });

  it("falls back to the id for a model it does not list", () => {
    render(<ModelField models={MODELS} value="gone" onChange={vi.fn()} />);
    expect(trigger().textContent).toBe("gone");
  });
});

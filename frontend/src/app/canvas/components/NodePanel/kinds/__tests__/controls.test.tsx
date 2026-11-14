// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { baseRequest, KindPlaceholder, SettingSelect, TemperatureSlider, TextOutput } from "../controls";

describe("TemperatureSlider", () => {
  it("shows the value to one place and reports a number", () => {
    const onChange = vi.fn();
    render(<TemperatureSlider value={0.5} onChange={onChange} />);
    expect(screen.getByText("0.5")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Temperature"), { target: { value: "1.3" } });
    expect(onChange).toHaveBeenCalledWith(1.3);
  });
});

describe("SettingSelect", () => {
  it("shows its label over the select, which carries the name itself", () => {
    const { container } = render(
      <SettingSelect label="Duration" options={["4", "6"]} value="6" format={(d) => `${d}s`} onChange={vi.fn()} />
    );
    const label = container.querySelector(".setting-select > .setting-select-label");
    expect(label).toHaveTextContent("Duration");
    // For the eye only: the select is named by aria-label, not read twice.
    expect(label).toHaveAttribute("aria-hidden", "true");
    const select = screen.getByLabelText("Duration") as HTMLSelectElement;
    expect(select).toHaveClass("setting-select-box");
    expect(select.value).toBe("6");
    expect([...select.options].map((o) => o.textContent)).toEqual(["4s", "6s"]);
  });

  it("reports the chosen value, for numbers too", () => {
    const onChange = vi.fn();
    render(<SettingSelect label="Images" options={[1, 2, 3]} value={2} format={(n) => `×${n}`} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Images"), { target: { value: "3" } });
    expect(onChange).toHaveBeenCalledWith("3");
  });
});

describe("KindPlaceholder and TextOutput", () => {
  it("says what will appear", () => {
    const { container } = render(<KindPlaceholder noun="Video" icon={<path d="M0 0" />} />);
    expect(container.querySelector(".node-panel-placeholder-text")).toHaveTextContent("Video willappear here");
    expect(container.querySelector("svg.node-panel-image-icon path")).not.toBeNull();
  });

  it("renders text in the scrolling output box", () => {
    const { container } = render(<TextOutput value="hello" />);
    expect(container.querySelector(".node-panel-text-output")).toHaveTextContent("hello");
  });
});

describe("baseRequest", () => {
  const ref = { kind: "text" as const, text: "t" };

  it("omits references when there are none", () => {
    expect(baseRequest([])).toEqual({ references: undefined });
    expect(baseRequest([ref])).toEqual({ references: [ref] });
  });

  it("carries the prompt's skills but not its agent", () => {
    const skills = [{ name: "s", content: "c" }];
    expect(baseRequest([], { skills, agent: { name: "a", instructions: "i" } })).toEqual({ references: undefined, skills });
  });
});

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
  it("as a setting, is labelled above the select", () => {
    const { container } = render(
      <SettingSelect variant="setting" label="Duration" options={["4", "6"]} value="6" format={(d) => `${d}s`} onChange={vi.fn()} />
    );
    expect(container.querySelector(".node-panel-setting .node-panel-setting-label")).toHaveTextContent("Duration");
    const select = screen.getByLabelText("Duration") as HTMLSelectElement;
    expect(select).toHaveClass("node-panel-select");
    expect(select.value).toBe("6");
    expect([...select.options].map((o) => o.textContent)).toEqual(["4s", "6s"]);
  });

  it("as an option, is a bare select with its title, and reports the value", () => {
    const onChange = vi.fn();
    const { container } = render(
      <SettingSelect variant="option" label="Images" title="Images" options={[1, 2, 3]} value={2} format={(n) => `×${n}`} onChange={onChange} />
    );
    expect(container.querySelector(".node-panel-option > select.node-panel-option-select")).not.toBeNull();
    expect(container.querySelector(".node-panel-setting-label")).toBeNull();
    const select = screen.getByLabelText("Images");
    expect(select).toHaveAttribute("title", "Images");
    fireEvent.change(select, { target: { value: "3" } });
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

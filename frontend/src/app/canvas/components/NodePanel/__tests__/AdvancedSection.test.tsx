// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AdvancedSection from "../AdvancedSection";

const trigger = (name = "Advanced settings") => screen.getByRole("button", { name });

describe("AdvancedSection", () => {
  it("starts closed, with what it holds not rendered", () => {
    render(<AdvancedSection><p>inside</p></AdvancedSection>);
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("inside")).toBeNull();
  });

  it("opens and closes from its trigger", () => {
    render(<AdvancedSection><p>inside</p></AdvancedSection>);
    fireEvent.click(trigger());
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("inside")).toBeTruthy();
    fireEvent.click(trigger());
    expect(screen.queryByText("inside")).toBeNull();
  });

  it("can start open and take another label", () => {
    render(<AdvancedSection label="More" defaultOpen><p>inside</p></AdvancedSection>);
    expect(trigger("More").getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("inside")).toBeTruthy();
  });
});

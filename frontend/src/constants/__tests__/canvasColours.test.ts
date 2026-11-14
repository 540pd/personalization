import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COLORS } from "@/constants/canvas.constants";

// Konva cannot read CSS variables, so two interface colours are written
// twice: in the stylesheet's @theme and in COLORS (#551). This is the guard
// that they are changed together.
const css = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");

function token(name: string): string {
  const found = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!found) throw new Error(`--color-${name} is not a six-digit hex value in globals.css`);
  return found[1].toLowerCase();
}

describe("canvas colours mirror the design tokens", () => {
  it("draws selection in the accent", () => {
    expect(COLORS.selected.toLowerCase()).toBe(token("accent"));
  });

  it("fills an empty Create node with the quiet surface", () => {
    expect(COLORS.placeholder.toLowerCase()).toBe(token("subtle"));
  });
});

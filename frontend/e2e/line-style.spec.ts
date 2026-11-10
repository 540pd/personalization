import { test, expect, type Page } from "@playwright/test";
import { openBoard, showEveryMenuItem } from "./helpers";

// Draws items #404 hides by default, so offer them all.
test.beforeEach(({ page }) => showEveryMenuItem(page));

// Issue #162. The style bar on lines and arrows: Color and Stroke, no Fill.

/* eslint-disable @typescript-eslint/no-explicit-any */

const shapesBtn = (page: Page) => page.getByRole("button", { name: "Shapes", exact: true });
const dockColor = (page: Page) => page.getByRole("button", { name: "Color", exact: true });
const bar = (page: Page) => page.getByTestId("shape-style-bar");
const colorBtn = (page: Page) => page.getByRole("button", { name: "Shape color" });
const fillBtn = (page: Page) => page.getByRole("button", { name: "Shape fill" });
const strokeBtn = (page: Page) => page.getByRole("button", { name: "Shape stroke" });
const colors = (page: Page) => page.getByRole("group", { name: "Shape colors" });
const strokes = (page: Page) => page.getByRole("group", { name: "Stroke options" });
const option = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const menuItem = (page: Page, label: string) =>
  page.locator(".floating-dock-submenu button").filter({
    has: page.locator("span", { hasText: new RegExp(`^${label}$`) }),
  });

const CORAL = "#f8695f";

async function clickEmpty(page: Page) {
  await page.mouse.click(1000, 150);
  await page.waitForTimeout(250);
}

async function drag(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 });
  await page.mouse.move(x2, y2, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

/** Draws a shape; it is left selected, as every new shape is. */
async function draw(page: Page, label: string, x1: number, y1: number, x2: number, y2: number) {
  await shapesBtn(page).click();
  await menuItem(page, label).click();
  await drag(page, x1, y1, x2, y2);
}

async function pickStroke(page: Page, name: string) {
  await strokeBtn(page).click();
  await strokes(page).getByRole("button", { name, exact: true }).click();
  await page.waitForTimeout(150);
}

async function pickColor(page: Page, name: string) {
  await colorBtn(page).click();
  await colors(page).getByRole("button", { name, exact: true }).click();
  await page.waitForTimeout(150);
}

/** The style attrs of every shape and line on the board, in paint order. */
const items = (page: Page): Promise<Record<string, any>[]> =>
  page.evaluate(() =>
    (window as any).Konva.stages[0].find(".selectable")
      .filter((n: any) => n.getClassName() === "BoardShape")
      .map((n: any) => ({
        kind: n.getAttr("shapeKind"),
        swatch: n.getAttr("swatch") || null,
        strokeMode: n.getAttr("strokeMode"),
        stroke: n.stroke(),
        fill: n.fill() ?? null,
        strokeEnabled: n.strokeEnabled(),
        strokeWidth: n.strokeWidth(),
        dash: n.dashEnabled() ? n.dash() : [],
        bend: n.getAttr("bend") ?? 0,
      })));

const item = async (page: Page, i = 0) => (await items(page))[i];

/** Whether the board canvas has paint at each screen point. */
const painted = (page: Page, pts: [number, number][]) =>
  page.evaluate((pts) => {
    const canvas = (window as any).Konva.stages[0].getLayers()[0].getCanvas()._canvas as HTMLCanvasElement;
    const r = canvas.getBoundingClientRect();
    const ratio = canvas.width / r.width;
    const ctx = canvas.getContext("2d")!;
    return pts.map(([x, y]) => ctx.getImageData((x - r.left) * ratio, (y - r.top) * ratio, 1, 1).data[3] > 0);
  }, pts);

test.describe("the style bar on lines and arrows", () => {
  test("shows Color and Stroke, and no Fill, above a line and an arrow", async ({ page }) => {
    await openBoard(page);
    for (const label of ["Line", "Arrow"]) {
      await draw(page, label, 400, 300, 700, 360);
      await expect(bar(page), label).toBeVisible();
      await expect(colorBtn(page)).toBeVisible();
      await expect(strokeBtn(page)).toBeVisible();
      await expect(fillBtn(page)).toHaveCount(0);
      const box = (await bar(page).boundingBox())!;
      expect(box.y + box.height).toBeLessThan(300);
      expect(Math.abs(box.x + box.width / 2 - 550)).toBeLessThan(3);
      await page.keyboard.press("Delete");
    }
  });

  test("has no No-stroke option for a line, nor for a line with a shape", async ({ page }) => {
    await openBoard(page);
    await draw(page, "Line", 400, 300, 700, 300);
    await strokeBtn(page).click();
    await expect(option(page, "Solid stroke")).toBeVisible();
    await expect(option(page, "No stroke")).toHaveCount(0);
    await page.keyboard.press("Escape");

    // A rectangle as well: no Fill, no No stroke.
    await draw(page, "Rectangle", 400, 400, 600, 500);
    await page.keyboard.down("Shift");
    await page.mouse.click(550, 300);
    await page.keyboard.up("Shift");
    await expect(bar(page)).toBeVisible();
    await expect(fillBtn(page)).toHaveCount(0);
    await strokeBtn(page).click();
    await expect(option(page, "No stroke")).toHaveCount(0);

    // A pick applies to both, by their own rules.
    await option(page, "Dashed stroke").click();
    await page.waitForTimeout(150);
    const byKind = Object.fromEntries((await items(page)).map((s) => [s.kind, s]));
    expect(byKind.line).toMatchObject({ strokeMode: "dashed", dash: [6, 8] });
    expect(byKind.rect).toMatchObject({ strokeMode: "dashed", dash: [8, 6] });
  });

  test("Color: the line takes the swatch itself, and so does the next item", async ({ page }) => {
    await openBoard(page);
    await draw(page, "Arrow", 400, 300, 700, 300);
    await pickColor(page, "Coral");
    expect(await item(page)).toMatchObject({ swatch: CORAL, stroke: CORAL, fill: null });

    await dockColor(page).click();
    await expect(page.getByRole("group", { name: "Colors" }).getByRole("button", { name: "Coral", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await draw(page, "Line", 400, 450, 700, 450);
    expect(await item(page, 1)).toMatchObject({ swatch: CORAL, stroke: CORAL });
  });

  test("Stroke: dashed, dotted and the widths", async ({ page }) => {
    await openBoard(page);
    await draw(page, "Line", 400, 300, 700, 300);

    await pickStroke(page, "Dashed stroke");
    expect(await item(page)).toMatchObject({ strokeMode: "dashed", dash: [6, 8] });
    await pickStroke(page, "Stroke width 6");
    expect(await item(page)).toMatchObject({ strokeWidth: 6, dash: [18, 24] });
    await pickStroke(page, "Dotted stroke");
    expect(await item(page)).toMatchObject({ strokeMode: "dotted", dash: [0, 14] });
    await pickStroke(page, "Solid stroke");
    expect(await item(page)).toMatchObject({ strokeMode: "solid", dash: [], strokeEnabled: true });
  });

  test("a dashed arrow keeps a solid head", async ({ page }) => {
    await openBoard(page);
    await draw(page, "Arrow", 400, 300, 700, 300);
    await pickStroke(page, "Stroke width 4");
    await pickStroke(page, "Dashed stroke");
    await clickEmpty(page);

    // The head's arms run 20px back from the tip at 30 degrees either side.
    // Solid: paint all along them, where a dash would leave gaps.
    const arm = (side: number): [number, number][] =>
      [0.3, 0.45, 0.6, 0.75, 0.9].map((t) => [
        700 - 20 * t * Math.cos(Math.PI / 6),
        300 + side * 20 * t * Math.sin(Math.PI / 6),
      ]);
    expect(await painted(page, [...arm(-1), ...arm(1)])).toEqual(Array(10).fill(true));

    // While the shaft does have gaps.
    const shaft = Array.from({ length: 40 }, (_, i): [number, number] => [420 + i, 300]);
    expect((await painted(page, shaft)).includes(false)).toBe(true);
  });

  test("a dashed line is grabbed in its gaps too", async ({ page }) => {
    await openBoard(page);
    await draw(page, "Line", 400, 300, 700, 300);
    await pickStroke(page, "Dashed stroke");
    await clickEmpty(page);

    // Dashes run 0-6 from the start, the gap 6-14: 410 is in the first gap.
    expect(await painted(page, [[410, 300]])).toEqual([false]);
    await page.mouse.click(410, 300);
    await expect(bar(page)).toBeVisible();
  });

  test("hides while an end or the bend is dragged, then comes back", async ({ page }) => {
    await openBoard(page);
    await draw(page, "Line", 400, 300, 700, 300);
    await pickStroke(page, "Dotted stroke");

    for (const grip of ["b", "bend"]) {
      const h = (await page.getByTestId(`line-handle-${grip}`).boundingBox())!;
      await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
      await page.mouse.down();
      await page.mouse.move(h.x + h.width / 2 + 10, h.y + h.height / 2 + 40, { steps: 4 });
      await expect(bar(page), grip).toHaveCount(0);
      await page.mouse.up();
      await expect(bar(page), grip).toBeVisible();
    }
    // Bent and moved, still dotted.
    expect(await item(page)).toMatchObject({ strokeMode: "dotted", dash: [0, 6] });
    expect((await item(page)).bend).not.toBe(0);
  });

  test("restyles every selected line as one undo step, and shows mixed values", async ({ page }) => {
    await openBoard(page);
    await draw(page, "Line", 400, 300, 700, 300);
    await pickStroke(page, "Dashed stroke");
    await draw(page, "Arrow", 400, 400, 700, 400);
    await page.keyboard.down("Shift");
    await page.mouse.click(550, 300);
    await page.keyboard.up("Shift");

    await strokeBtn(page).click();
    await expect(option(page, "Solid stroke")).toHaveAttribute("aria-pressed", "false");
    await expect(option(page, "Dashed stroke")).toHaveAttribute("aria-pressed", "false");
    await option(page, "Dotted stroke").click();
    await page.waitForTimeout(150);
    expect((await items(page)).map((s) => s.strokeMode)).toEqual(["dotted", "dotted"]);

    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(150);
    const byKind = Object.fromEntries((await items(page)).map((s) => [s.kind, s.strokeMode]));
    expect(byKind).toEqual({ line: "dashed", arrow: "solid" });
  });

  test("copy-paste keeps the style", async ({ page }) => {
    await openBoard(page);
    await draw(page, "Arrow", 400, 300, 700, 340);
    await pickColor(page, "Coral");
    await pickStroke(page, "Dotted stroke");
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    await page.waitForTimeout(200);
    const [a, b] = await items(page);
    expect(b).toEqual(a);
  });
});

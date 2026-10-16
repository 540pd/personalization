import { test, expect, type Page } from "@playwright/test";
import { openBoard, uploadImage, collapsePanels, setZoom } from "./helpers";

// Issue #161. The bar above a selected shape: Color, Fill and Stroke.

/* eslint-disable @typescript-eslint/no-explicit-any */

const frameBtn = (page: Page) => page.locator(".floating-dock button[aria-pressed]").nth(3);
const shapesBtn = (page: Page) => page.locator(".floating-dock button[aria-pressed]").nth(4);
const textBtn = (page: Page) => page.locator(".floating-dock button[aria-pressed]").nth(5);
const dockColor = (page: Page) => page.getByRole("button", { name: "Color", exact: true });
const bar = (page: Page) => page.getByTestId("shape-style-bar");
const colorBtn = (page: Page) => page.getByRole("button", { name: "Shape color" });
const fillBtn = (page: Page) => page.getByRole("button", { name: "Shape fill" });
const strokeBtn = (page: Page) => page.getByRole("button", { name: "Shape stroke" });
const colors = (page: Page) => page.getByRole("group", { name: "Shape colors" });
const fills = (page: Page) => page.getByRole("group", { name: "Fill options" });
const strokes = (page: Page) => page.getByRole("group", { name: "Stroke options" });
const option = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const menuItem = (page: Page, label: string) =>
  page.locator(".floating-dock-submenu button").filter({
    has: page.locator("span", { hasText: new RegExp(`^${label}$`) }),
  });

const GREEN = "#45cf6e";
const GREEN_OUTLINE = "#349b53";
const GREEN_TINT = "#e9f9ee";
const BLUE = "#3b9ef5";

/** A click on empty board, clearing the selection. Inside a 1280px window. */
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
async function drawShape(page: Page, label: string, x1: number, y1: number, x2: number, y2: number) {
  await shapesBtn(page).click();
  await menuItem(page, label).click();
  await drag(page, x1, y1, x2, y2);
}

async function pickFill(page: Page, name: string) {
  await fillBtn(page).click();
  await fills(page).getByRole("button", { name, exact: true }).click();
  await page.waitForTimeout(150);
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

/** The style attrs of every shape on the board, in paint order. */
const shapes = (page: Page): Promise<Record<string, any>[]> =>
  page.evaluate(() =>
    (window as any).Konva.stages[0].find(".selectable")
      .filter((n: any) => n.getClassName() === "BoardShape")
      .map((n: any) => ({
        kind: n.getAttr("shapeKind"),
        swatch: n.getAttr("swatch") || null,
        fillMode: n.getAttr("fillMode"),
        strokeMode: n.getAttr("strokeMode"),
        fill: n.fill(),
        stroke: n.stroke(),
        strokeEnabled: n.strokeEnabled(),
        strokeWidth: n.strokeWidth(),
        dash: n.dashEnabled() ? n.dash() : [],
      })));

const shape = async (page: Page, i = 0) => (await shapes(page))[i];

test.describe("the shape style bar", () => {
  test("shows above a selected shape, centred, with Color, Fill and Stroke", async ({ page }) => {
    await openBoard(page);
    await drawShape(page, "Rectangle", 450, 300, 750, 450);

    await expect(bar(page)).toBeVisible();
    await expect(bar(page)).toHaveAttribute("data-placement", "above");
    const box = (await bar(page).boundingBox())!;
    expect(box.y + box.height).toBeLessThan(300);
    expect(Math.abs(box.x + box.width / 2 - 600)).toBeLessThan(3);
    await expect(colorBtn(page)).toBeVisible();
    await expect(fillBtn(page)).toBeVisible();
    await expect(strokeBtn(page)).toBeVisible();

    // A new shape is as before: solid fill, solid stroke, width 2.
    await fillBtn(page).click();
    await expect(option(page, "Solid fill")).toHaveAttribute("aria-pressed", "true");
    await strokeBtn(page).click();
    await expect(option(page, "Solid stroke")).toHaveAttribute("aria-pressed", "true");
    await expect(option(page, "Stroke width 2")).toHaveAttribute("aria-pressed", "true");
  });

  test("shows for each filled shape", async ({ page }) => {
    await openBoard(page);
    for (const label of ["Ellipse", "Triangle", "Diamond", "Block Arrow"]) {
      await drawShape(page, label, 450, 300, 650, 420);
      await expect(bar(page), label).toBeVisible();
      await page.keyboard.press("Delete");
    }
  });

  // Lines and arrows get the bar too, without Fill: e2e/line-style.spec.ts (#162).
  test("does not show for text, a Frame, an image or a mixed selection", async ({ page }) => {
    await openBoard(page);

    await textBtn(page).click();
    await page.mouse.click(700, 200);
    await page.keyboard.type("Hello");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    await page.mouse.click(705, 205);
    await expect(bar(page)).toHaveCount(0);

    await frameBtn(page).click();
    await drag(page, 300, 450, 500, 600);
    await expect(bar(page)).toHaveCount(0);

    // A shape with an image: not all shapes, so no bar.
    await uploadImage(page, 200, 150);
    await collapsePanels(page);
    await drawShape(page, "Rectangle", 800, 450, 950, 550);
    await expect(bar(page)).toBeVisible();
    await page.keyboard.press("ControlOrMeta+a");
    await expect(bar(page)).toHaveCount(0);
  });

  test("flips below a shape at the top of the screen", async ({ page }) => {
    await openBoard(page);
    await drawShape(page, "Rectangle", 450, 30, 750, 160);
    await expect(bar(page)).toHaveAttribute("data-placement", "below");
    const box = (await bar(page).boundingBox())!;
    expect(box.y).toBeGreaterThan(160);
  });

  test("hides while the shape is dragged and resized, then comes back", async ({ page }) => {
    await openBoard(page);
    await drawShape(page, "Rectangle", 450, 300, 750, 450);

    await page.mouse.move(600, 380);
    await page.mouse.down();
    await page.mouse.move(640, 400, { steps: 4 });
    await expect(bar(page)).toHaveCount(0);
    await page.mouse.up();
    await expect(bar(page)).toBeVisible();

    // The bottom-right corner handle, now at (790, 470).
    await page.mouse.move(790, 470);
    await page.mouse.down();
    await page.mouse.move(830, 500, { steps: 4 });
    await expect(bar(page)).toHaveCount(0);
    await page.mouse.up();
    await expect(bar(page)).toBeVisible();
  });

  test("Fill: none, pattern and solid, in the shape's colour", async ({ page }) => {
    await openBoard(page);
    await drawShape(page, "Rectangle", 450, 300, 750, 450);
    await pickColor(page, "Green");
    expect(await shape(page)).toMatchObject({ fill: GREEN, stroke: GREEN_OUTLINE, fillMode: "solid" });

    await pickFill(page, "No fill");
    expect(await shape(page)).toMatchObject({ fill: "transparent", stroke: GREEN_OUTLINE, fillMode: "none" });
    // The inside of an unfilled shape is still the shape: a click there selects it.
    await clickEmpty(page);
    await expect(bar(page)).toHaveCount(0);
    await page.mouse.click(600, 380);
    await expect(bar(page)).toBeVisible();

    await pickFill(page, "Pattern fill");
    expect(await shape(page)).toMatchObject({ fill: GREEN_TINT, stroke: GREEN_OUTLINE, fillMode: "pattern" });

    await pickFill(page, "Solid fill");
    expect(await shape(page)).toMatchObject({ fill: GREEN, fillMode: "solid" });
  });

  test("Pattern fill paints dots in the colour over a pale tint", async ({ page }) => {
    await openBoard(page);
    await drawShape(page, "Rectangle", 450, 300, 750, 450);
    await pickColor(page, "Green");
    await pickFill(page, "Pattern fill");
    await clickEmpty(page);

    // Not one flat colour: the dots and the tint between them both show.
    const pixels = await page.evaluate(() => {
      const canvas = (window as any).Konva.stages[0].getLayers()[0].getCanvas()._canvas as HTMLCanvasElement;
      const ratio = canvas.width / canvas.getBoundingClientRect().width;
      const r = canvas.getBoundingClientRect();
      const ctx = canvas.getContext("2d")!;
      const data = ctx.getImageData((600 - r.left) * ratio, (380 - r.top) * ratio, 12 * ratio, 12 * ratio).data;
      const seen = new Set<string>();
      for (let i = 0; i < data.length; i += 4) seen.add(`${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`);
      return seen.size;
    });
    expect(pixels).toBeGreaterThan(2);
  });

  test("Stroke: style and width", async ({ page }) => {
    await openBoard(page);
    await drawShape(page, "Rectangle", 450, 300, 750, 450);

    await pickStroke(page, "Dashed stroke");
    expect(await shape(page)).toMatchObject({ strokeMode: "dashed", dash: [8, 6], strokeEnabled: true });

    await pickStroke(page, "Stroke width 4");
    expect(await shape(page)).toMatchObject({ strokeMode: "dashed", strokeWidth: 4, dash: [16, 12] });

    await pickStroke(page, "Dotted stroke");
    expect(await shape(page)).toMatchObject({ strokeMode: "dotted", dash: [0, 10] });

    await pickStroke(page, "No stroke");
    expect(await shape(page)).toMatchObject({ strokeMode: "none", strokeEnabled: false });

    await pickStroke(page, "Solid stroke");
    expect(await shape(page)).toMatchObject({ strokeMode: "solid", strokeEnabled: true, dash: [] });
  });

  test("a shape with no fill always keeps an outline", async ({ page }) => {
    await openBoard(page);
    await drawShape(page, "Rectangle", 450, 300, 750, 450);

    // No stroke, then no fill: the default solid outline comes back.
    await pickStroke(page, "No stroke");
    await pickFill(page, "No fill");
    expect(await shape(page)).toMatchObject({ fillMode: "none", strokeMode: "solid", strokeEnabled: true });

    // No fill, then no stroke: the outline stays.
    await pickStroke(page, "No stroke");
    expect(await shape(page)).toMatchObject({ fillMode: "none", strokeMode: "solid", strokeEnabled: true });
  });

  test("Color keeps the fill and stroke, and sets the colour for the next shape", async ({ page }) => {
    await openBoard(page);
    await drawShape(page, "Rectangle", 450, 300, 750, 450);
    await pickFill(page, "Pattern fill");
    await pickStroke(page, "Dotted stroke");

    await pickColor(page, "Green");
    expect(await shape(page)).toMatchObject({
      swatch: GREEN, fill: GREEN_TINT, stroke: GREEN_OUTLINE, fillMode: "pattern", strokeMode: "dotted",
    });
    await colorBtn(page).click();
    await expect(option(page, "Green")).toHaveAttribute("aria-pressed", "true");

    // The dock's Color took it too: the next shape is green.
    await dockColor(page).click();
    await expect(page.getByRole("group", { name: "Colors" }).getByRole("button", { name: "Green", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await drawShape(page, "Ellipse", 450, 500, 600, 600);
    expect(await shape(page, 1)).toMatchObject({ swatch: GREEN, fill: GREEN, fillMode: "solid" });
  });

  test("restyles every selected shape as one undo step, and shows mixed values", async ({ page }) => {
    await openBoard(page);
    await drawShape(page, "Rectangle", 300, 300, 450, 400);
    await pickColor(page, "Green");
    await drawShape(page, "Ellipse", 550, 300, 700, 400);
    await pickColor(page, "Blue");
    await pickStroke(page, "Dashed stroke");

    await page.keyboard.down("Shift");
    await page.mouse.click(375, 350);
    await page.keyboard.up("Shift");
    await expect(bar(page)).toBeVisible();

    // The two differ in colour and stroke, so nothing is marked there.
    await colorBtn(page).click();
    await expect(colors(page).locator("[aria-pressed=true]")).toHaveCount(0);
    await strokeBtn(page).click();
    await expect(option(page, "Solid stroke")).toHaveAttribute("aria-pressed", "false");
    await expect(option(page, "Dashed stroke")).toHaveAttribute("aria-pressed", "false");
    // Both are still width 2.
    await expect(option(page, "Stroke width 2")).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");

    await pickFill(page, "No fill");
    expect((await shapes(page)).map((s) => s.fillMode)).toEqual(["none", "none"]);
    // Each keeps its own colour. (By kind: clicking the rect raised it.)
    const byKind = Object.fromEntries((await shapes(page)).map((s) => [s.kind, s.swatch]));
    expect(byKind).toEqual({ rect: GREEN, ellipse: BLUE });

    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(150);
    expect((await shapes(page)).map((s) => s.fillMode)).toEqual(["solid", "solid"]);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await page.waitForTimeout(150);
    expect((await shapes(page)).map((s) => s.fillMode)).toEqual(["none", "none"]);
  });

  test("undo puts back the default style of a shape restyled for the first time", async ({ page }) => {
    await openBoard(page);
    await drawShape(page, "Rectangle", 450, 300, 750, 450);
    const before = await shape(page);
    await pickColor(page, "Green");
    await pickFill(page, "Pattern fill");

    await page.keyboard.press("ControlOrMeta+z");
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(150);
    expect(await shape(page)).toEqual(before);
  });

  test("copy-paste keeps the style", async ({ page }) => {
    await openBoard(page);
    await drawShape(page, "Rectangle", 450, 300, 650, 400);
    await pickColor(page, "Green");
    await pickFill(page, "Pattern fill");
    await pickStroke(page, "Dotted stroke");

    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    await page.waitForTimeout(200);
    const [a, b] = await shapes(page);
    expect(b).toEqual(a);
  });

  test("cards: one open at a time, closed by a pick, Esc, a click outside or a second click", async ({ page }) => {
    await openBoard(page);
    await drawShape(page, "Rectangle", 450, 300, 750, 450);

    await fillBtn(page).click();
    await expect(fills(page)).toBeVisible();
    await strokeBtn(page).click();
    await expect(fills(page)).toHaveCount(0);
    await expect(strokes(page)).toBeVisible();
    await strokeBtn(page).click();
    await expect(strokes(page)).toHaveCount(0);

    // Esc closes only the card: the shape stays selected.
    await colorBtn(page).click();
    await page.keyboard.press("Escape");
    await expect(colors(page)).toHaveCount(0);
    await expect(bar(page)).toBeVisible();

    await pickFill(page, "No fill");
    await expect(fills(page)).toHaveCount(0);

    // A click outside on the board closes the card, and deselects as ever.
    await colorBtn(page).click();
    await page.mouse.click(1000, 150);
    await expect(colors(page)).toHaveCount(0);
  });

  test("keeps its size at 50% and 150% zoom, and follows the shape", async ({ page }) => {
    await openBoard(page);
    await drawShape(page, "Rectangle", 450, 300, 750, 450);
    const at100 = (await bar(page).boundingBox())!;

    for (const z of [0.5, 1.5]) {
      await setZoom(page, z);
      const box = (await bar(page).boundingBox())!;
      expect(box.height).toBeCloseTo(at100.height, 0);
      expect(box.width).toBeCloseTo(at100.width, 0);
      // Still just above the shape, wherever the zoom put it.
      const top = await page.evaluate(() => {
        const st = (window as any).Konva.stages[0];
        const n = st.find(".selectable")[0];
        return n.getClientRect().y + st.container().getBoundingClientRect().top;
      });
      expect(top - (box.y + box.height)).toBeGreaterThan(5);
      expect(top - (box.y + box.height)).toBeLessThan(25);
    }
  });
});

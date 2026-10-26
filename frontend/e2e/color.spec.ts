import { test, expect, type Page } from "@playwright/test";
import { openBoard, uploadImage, collapsePanels, setZoom } from "./helpers";

// Issue #159. The dock's Color card: picking a swatch recolours what is
// selected and sets the colour the next shape or text is drawn in.

/* eslint-disable @typescript-eslint/no-explicit-any */

const frameBtn = (page: Page) => page.getByRole("button", { name: "Frame", exact: true });
const shapesBtn = (page: Page) => page.getByRole("button", { name: "Shapes", exact: true });
const textBtn = (page: Page) => page.getByRole("button", { name: "Text", exact: true });
const colorBtn = (page: Page) => page.getByRole("button", { name: "Color", exact: true });
const card = (page: Page) => page.getByRole("group", { name: "Colors" });
const swatch = (page: Page, name: string) => card(page).getByRole("button", { name, exact: true });
const menuItem = (page: Page, label: string) =>
  page.locator(".floating-dock-submenu button").filter({
    has: page.locator("span", { hasText: new RegExp(`^${label}$`) }),
  });

const CORAL = "#f8695f";
const CORAL_OUTLINE = "#ba4f47";
const BLUE = "#3b9ef5";

async function pick(page: Page, name: string) {
  await colorBtn(page).click();
  await swatch(page, name).click();
  await page.waitForTimeout(150);
}

async function drag(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 });
  await page.mouse.move(x2, y2, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function drawShape(page: Page, label: string, x1: number, y1: number, x2: number, y2: number) {
  await shapesBtn(page).click();
  await menuItem(page, label).click();
  await drag(page, x1, y1, x2, y2);
}

async function placeText(page: Page, x: number, y: number, value: string) {
  await textBtn(page).click();
  await page.mouse.click(x, y);
  await page.keyboard.type(value);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
}

/** Fill and stroke of every shape and text on the board, in paint order. */
const items = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).Konva.stages[0];
    return s.find(".selectable")
      .filter((n: any) => n.getClassName() !== "Image")
      .map((n: any) => ({
        kind: n.getClassName() === "BoardShape" ? n.getAttr("shapeKind") : "text",
        fill: n.fill() ?? null,
        stroke: n.stroke() ?? null,
      }));
  });

/** Every frame's outline colour. */
const frameStrokes = (page: Page) =>
  page.evaluate(() => {
    const stages = (window as any).Konva.stages as any[];
    const fs = stages.find((st) => st.find(".frame").length);
    return fs ? fs.find(".frame").map((r: any) => r.stroke()) : [];
  });

const imageFill = (page: Page) =>
  page.evaluate(() => {
    const img = (window as any).Konva.stages[0].find("Image")[0];
    return { fill: img.fill() ?? null, stroke: img.stroke() ?? null };
  });

test.describe("the Color card", () => {
  test("opens 12 swatches over the dock, and leaves the armed tool alone", async ({ page }) => {
    await openBoard(page);
    await frameBtn(page).click();
    await colorBtn(page).click();

    await expect(card(page)).toBeVisible();
    await expect(card(page).getByRole("button")).toHaveCount(12);
    await expect(colorBtn(page)).toHaveAttribute("aria-expanded", "true");
    // Opening the card is not choosing a tool.
    await expect(frameBtn(page)).toHaveAttribute("aria-pressed", "true");
  });

  test("closes on a pick, on Esc, on a click outside and on a second click", async ({ page }) => {
    await openBoard(page);

    await pick(page, "Blue");
    await expect(card(page)).toHaveCount(0);

    await colorBtn(page).click();
    await page.keyboard.press("Escape");
    await expect(card(page)).toHaveCount(0);

    await colorBtn(page).click();
    await page.mouse.click(300, 200);
    await expect(card(page)).toHaveCount(0);

    await colorBtn(page).click();
    await colorBtn(page).click();
    await expect(card(page)).toHaveCount(0);
  });

  test("the dot shows the current colour and the card marks it", async ({ page }) => {
    await openBoard(page);
    const dot = colorBtn(page).locator("circle");
    // Black, as in the reference, until something is picked.
    await expect(dot).toHaveAttribute("fill", "#1f1f1f");

    await pick(page, "Coral");
    await expect(dot).toHaveAttribute("fill", CORAL);

    await colorBtn(page).click();
    await expect(swatch(page, "Coral")).toHaveAttribute("aria-pressed", "true");
    await expect(card(page).locator('[aria-pressed="true"]')).toHaveCount(1);
  });
});

test.describe("recolouring the selection", () => {
  test("a filled shape takes the swatch, with a darker outline", async ({ page }) => {
    await openBoard(page);
    await drawShape(page, "Rectangle", 300, 150, 450, 260);

    await pick(page, "Coral");

    expect(await items(page)).toEqual([{ kind: "rect", fill: CORAL, stroke: CORAL_OUTLINE }]);
  });

  test("a line takes the swatch as its stroke, and gets no fill", async ({ page }) => {
    await openBoard(page);
    await drawShape(page, "Line", 300, 150, 450, 260);

    await pick(page, "Blue");

    expect(await items(page)).toEqual([{ kind: "line", fill: null, stroke: BLUE }]);
  });

  test("text takes the swatch as its letters", async ({ page }) => {
    await openBoard(page);
    await placeText(page, 320, 180, "hello");
    // Click the text to select it.
    await page.mouse.click(330, 180);
    await page.waitForTimeout(200);

    await pick(page, "Blue");

    const [t] = await items(page);
    expect(t.fill).toBe(BLUE);
  });

  test("a frame takes the swatch on its outline only", async ({ page }) => {
    await openBoard(page);
    await frameBtn(page).click();
    await drag(page, 250, 120, 500, 330);
    const fillBefore = await page.evaluate(() => {
      const fs = ((window as any).Konva.stages as any[]).find((st) => st.find(".frame").length);
      return fs.find(".frame")[0].fill();
    });

    await pick(page, "Coral");

    expect(await frameStrokes(page)).toEqual([CORAL]);
    const fillAfter = await page.evaluate(() => {
      const fs = ((window as any).Konva.stages as any[]).find((st) => st.find(".frame").length);
      return fs.find(".frame")[0].fill();
    });
    expect(fillAfter).toBe(fillBefore);
  });

  test("a mixed selection recolours shapes and frames, never an image, in one undo step", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 120, 90);
    await collapsePanels(page);
    await drawShape(page, "Ellipse", 300, 150, 420, 240);
    await frameBtn(page).click();
    await drag(page, 600, 120, 760, 300);
    const imageBefore = await imageFill(page);
    const frameBefore = await frameStrokes(page);
    const shapesBefore = await items(page);

    await page.mouse.click(900, 120);
    await page.keyboard.press("Control+a");
    await page.waitForTimeout(200);
    await pick(page, "Green");

    expect((await items(page))[0].fill).toBe("#45cf6e");
    expect(await frameStrokes(page)).toEqual(["#45cf6e"]);
    expect(await imageFill(page)).toEqual(imageBefore);

    await page.keyboard.press("Control+z");
    await page.waitForTimeout(200);
    expect(await items(page)).toEqual(shapesBefore);
    expect(await frameStrokes(page)).toEqual(frameBefore);
  });

  test("a recoloured shape keeps its colour through copy and paste", async ({ page }) => {
    await openBoard(page);
    await drawShape(page, "Rectangle", 300, 150, 420, 240);
    await pick(page, "Purple");

    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    await page.waitForTimeout(200);

    const all = await items(page);
    expect(all).toHaveLength(2);
    expect(all.map((i: { fill: string }) => i.fill)).toEqual(["#c08cf5", "#c08cf5"]);
  });

  test("recolours at 150% zoom", async ({ page }) => {
    await openBoard(page);
    await setZoom(page, 1.5);
    await drawShape(page, "Diamond", 300, 150, 420, 260);

    await pick(page, "Yellow");

    expect((await items(page))[0].fill).toBe("#fcd12a");
  });
});

test.describe("the colour for new items", () => {
  test("with nothing selected, a pick changes nothing on the board", async ({ page }) => {
    await openBoard(page);
    await drawShape(page, "Rectangle", 300, 150, 420, 240);
    const before = await items(page);
    await page.mouse.click(900, 120);
    await page.waitForTimeout(200);

    await pick(page, "Coral");

    expect(await items(page)).toEqual(before);
  });

  test("the next shape, line and text are drawn in the current colour", async ({ page }) => {
    await openBoard(page);
    await pick(page, "Coral");

    await drawShape(page, "Triangle", 300, 150, 420, 240);
    await drawShape(page, "Arrow", 500, 150, 620, 240);
    await page.mouse.click(900, 120);
    await placeText(page, 320, 330, "note");

    const [triangle, arrow, text] = await items(page);
    expect(triangle).toEqual({ kind: "triangle", fill: CORAL, stroke: CORAL_OUTLINE });
    expect(arrow).toMatchObject({ kind: "arrow", stroke: CORAL });
    expect(text.fill).toBe(CORAL);
  });

  test("a new frame keeps the default outline", async ({ page }) => {
    await openBoard(page);
    await frameBtn(page).click();
    await drag(page, 250, 120, 400, 260);
    const defaultStroke = (await frameStrokes(page))[0];
    await page.mouse.click(900, 120);

    await pick(page, "Coral");
    await frameBtn(page).click();
    await drag(page, 500, 120, 650, 260);

    expect(await frameStrokes(page)).toEqual([defaultStroke, defaultStroke]);
  });
});

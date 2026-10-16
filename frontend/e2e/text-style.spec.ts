import { test, expect, type Page } from "@playwright/test";
import { openBoard, setZoom } from "./helpers";

// Issue #164. The style bar on text: Color, which is the letters.

/* eslint-disable @typescript-eslint/no-explicit-any */

const frameBtn = (page: Page) => page.locator(".floating-dock button[aria-pressed]").nth(3);
const shapesBtn = (page: Page) => page.locator(".floating-dock button[aria-pressed]").nth(4);
const textBtn = (page: Page) => page.locator(".floating-dock button[aria-pressed]").nth(5);
const dockColor = (page: Page) => page.getByRole("button", { name: "Color", exact: true });
const bar = (page: Page) => page.getByTestId("shape-style-bar");
const colorBtn = (page: Page) => page.getByRole("button", { name: "Shape color" });
const colors = (page: Page) => page.getByRole("group", { name: "Shape colors" });
const menuItem = (page: Page, label: string) =>
  page.locator(".floating-dock-submenu button").filter({
    has: page.locator("span", { hasText: new RegExp(`^${label}$`) }),
  });

const CORAL = "#f8695f";
const BLUE = "#3b9ef5";
const TEXT_DEFAULT = "#171717";

async function drag(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 });
  await page.mouse.move(x2, y2, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

/** Places text; once typed and closed it is left selected. */
async function placeText(page: Page, x: number, y: number, value: string) {
  await textBtn(page).click();
  await page.mouse.click(x, y);
  await page.keyboard.type(value);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
}

async function pickColor(page: Page, name: string) {
  await colorBtn(page).click();
  await colors(page).getByRole("button", { name, exact: true }).click();
  await page.waitForTimeout(150);
}

/** Every text's colour, in paint order. */
const textFills = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    (window as any).Konva.stages[0].find(".selectable")
      .filter((n: any) => n.getClassName() === "Text")
      .map((n: any) => n.fill()));

/** The screen box of the i-th text. */
const textBox = (page: Page, i = 0) =>
  page.evaluate((i) => {
    const st = (window as any).Konva.stages[0];
    const n = st.find(".selectable").filter((n: any) => n.getClassName() === "Text")[i];
    const r = n.getClientRect();
    const c = st.container().getBoundingClientRect();
    return { x: c.left + r.x, y: c.top + r.y, w: r.width, h: r.height };
  }, i);

test.describe("the style bar on text", () => {
  test("shows Color only, centred above the text", async ({ page }) => {
    await openBoard(page);
    await placeText(page, 500, 300, "Hello there");

    await expect(bar(page)).toBeVisible();
    await expect(colorBtn(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Shape fill" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Shape stroke" })).toHaveCount(0);

    const t = await textBox(page);
    const box = (await bar(page).boundingBox())!;
    expect(box.y + box.height).toBeLessThan(t.y);
    expect(Math.abs(box.x + box.width / 2 - (t.x + t.w / 2))).toBeLessThan(3);
  });

  test("Color colours the letters, and the dot, card and next item follow", async ({ page }) => {
    await openBoard(page);
    await placeText(page, 500, 300, "Hello");
    expect(await textFills(page)).toEqual([TEXT_DEFAULT]);

    await pickColor(page, "Coral");
    expect(await textFills(page)).toEqual([CORAL]);

    await colorBtn(page).click();
    await expect(colors(page).getByRole("button", { name: "Coral", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");

    await dockColor(page).click();
    await expect(page.getByRole("group", { name: "Colors" }).getByRole("button", { name: "Coral", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await placeText(page, 500, 450, "Next");
    expect(await textFills(page)).toEqual([CORAL, CORAL]);
  });

  test("hides while the text is edited, and the editor shows its colour", async ({ page }) => {
    await openBoard(page);
    await placeText(page, 500, 300, "Hello");
    await pickColor(page, "Blue");

    const t = await textBox(page);
    await page.mouse.dblclick(t.x + t.w / 2, t.y + t.h / 2);
    await expect(page.getByTestId("text-editor")).toBeVisible();
    await expect(bar(page)).toHaveCount(0);
    await expect(page.getByTestId("text-editor")).toHaveCSS("color", "rgb(59, 158, 245)");

    await page.keyboard.press("Escape");
    await expect(bar(page)).toBeVisible();
  });

  test("hides while the text is dragged, then comes back", async ({ page }) => {
    await openBoard(page);
    await placeText(page, 500, 300, "Hello there");
    const t = await textBox(page);
    await page.mouse.move(t.x + t.w / 2, t.y + t.h / 2);
    await page.mouse.down();
    await page.mouse.move(t.x + t.w / 2 + 40, t.y + t.h / 2 + 30, { steps: 4 });
    await expect(bar(page)).toHaveCount(0);
    await page.mouse.up();
    await expect(bar(page)).toBeVisible();
  });

  test("with a shape and a Frame: Color only, one undo step for all", async ({ page }) => {
    await openBoard(page);
    await frameBtn(page).click();
    await drag(page, 300, 200, 450, 320);
    await shapesBtn(page).click();
    await menuItem(page, "Rectangle").click();
    await drag(page, 650, 220, 800, 320);
    await placeText(page, 500, 450, "Hello");

    await page.keyboard.press("ControlOrMeta+a");
    await expect(bar(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Shape fill" })).toHaveCount(0);

    await pickColor(page, "Blue");
    expect(await textFills(page)).toEqual([BLUE]);
    const rect = () =>
      page.evaluate(() =>
        (window as any).Konva.stages[0].find(".selectable")
          .find((n: any) => n.getClassName() === "BoardShape").fill());
    expect(await rect()).toBe(BLUE);

    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(150);
    expect(await textFills(page)).toEqual([TEXT_DEFAULT]);
    expect(await rect()).not.toBe(BLUE);
  });

  test("two texts of different colours show nothing marked", async ({ page }) => {
    await openBoard(page);
    await placeText(page, 500, 300, "One");
    await pickColor(page, "Coral");
    await placeText(page, 500, 450, "Two");
    await pickColor(page, "Blue");
    await page.keyboard.press("ControlOrMeta+a");
    await colorBtn(page).click();
    await expect(colors(page).locator("[aria-pressed=true]")).toHaveCount(0);
  });

  test("undo and copy-paste keep the colour", async ({ page }) => {
    await openBoard(page);
    await placeText(page, 500, 300, "Hello");
    await pickColor(page, "Coral");
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    await page.waitForTimeout(200);
    expect(await textFills(page)).toEqual([CORAL, CORAL]);

    await page.keyboard.press("ControlOrMeta+z");
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(150);
    expect(await textFills(page)).toEqual([TEXT_DEFAULT]);
  });

  test("keeps its size at 50% and 150% zoom", async ({ page }) => {
    await openBoard(page);
    await placeText(page, 500, 300, "Hello");
    const at100 = (await bar(page).boundingBox())!;
    for (const z of [0.5, 1.5]) {
      await setZoom(page, z);
      const box = (await bar(page).boundingBox())!;
      expect(box.height).toBeCloseTo(at100.height, 0);
      expect(box.width).toBeCloseTo(at100.width, 0);
    }
  });
});

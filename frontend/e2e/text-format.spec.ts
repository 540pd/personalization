import { test, expect, type Page } from "@playwright/test";
import { openBoard } from "./helpers";

// Issue #165. Text Size, Bold, Italic and Align in the style bar.

/* eslint-disable @typescript-eslint/no-explicit-any */

const shapesBtn = (page: Page) => page.getByRole("button", { name: "Shapes", exact: true });
const textBtn = (page: Page) => page.getByRole("button", { name: "Text", exact: true });
const bar = (page: Page) => page.getByTestId("shape-style-bar");
const sizeBtn = (page: Page) => page.getByRole("button", { name: "Text size" });
const boldBtn = (page: Page) => page.getByRole("button", { name: "Bold", exact: true });
const italicBtn = (page: Page) => page.getByRole("button", { name: "Italic", exact: true });
const alignBtn = (page: Page) => page.getByRole("button", { name: "Text align" });
const option = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const menuItem = (page: Page, label: string) =>
  page.locator(".floating-dock-submenu button").filter({
    has: page.locator("span", { hasText: new RegExp(`^${label}$`) }),
  });

async function drag(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 });
  await page.mouse.move(x2, y2, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

/** Places auto-width text, line by line; it is left selected. */
async function placeText(page: Page, x: number, y: number, ...lines: string[]) {
  await textBtn(page).click();
  await page.mouse.click(x, y);
  for (const [i, line] of lines.entries()) {
    if (i) await page.keyboard.press("Enter");
    await page.keyboard.type(line);
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
}

async function pickSize(page: Page, label: string) {
  await sizeBtn(page).click();
  await option(page, `Size ${label}`).click();
  await page.waitForTimeout(150);
}

async function pickAlign(page: Page, name: string) {
  await alignBtn(page).click();
  await option(page, name).click();
  await page.waitForTimeout(150);
}

/** Every text's format, in paint order. */
const texts = (page: Page): Promise<Record<string, any>[]> =>
  page.evaluate(() =>
    (window as any).Konva.stages[0].find(".selectable")
      .filter((n: any) => n.getClassName() === "Text")
      .map((n: any) => ({
        x: n.x(), y: n.y(), width: n.width(), height: n.height(),
        fontSize: n.fontSize(), fontStyle: n.fontStyle(), align: n.align(),
        autoWidth: !!n.getAttr("autoWidth"),
      })));

const text = async (page: Page, i = 0) => (await texts(page))[i];

/** The screen box of the i-th text. */
const textBox = (page: Page, i = 0) =>
  page.evaluate((i) => {
    const st = (window as any).Konva.stages[0];
    const n = st.find(".selectable").filter((n: any) => n.getClassName() === "Text")[i];
    const r = n.getClientRect();
    const c = st.container().getBoundingClientRect();
    return { x: c.left + r.x, y: c.top + r.y, w: r.width, h: r.height };
  }, i);

test.describe("text formatting in the style bar", () => {
  test("text alone gets Color, Size, Bold, Italic and Align; with a shape, Color only", async ({ page }) => {
    await openBoard(page);
    await placeText(page, 500, 300, "Hello");
    for (const b of [sizeBtn, boldBtn, italicBtn, alignBtn]) await expect(b(page)).toBeVisible();
    await expect(sizeBtn(page)).toHaveText("24");
    await expect(boldBtn(page)).toHaveAttribute("aria-pressed", "false");
    await expect(italicBtn(page)).toHaveAttribute("aria-pressed", "false");

    // New text is as before: 24, regular, left.
    expect(await text(page)).toMatchObject({ fontSize: 24, fontStyle: "normal", align: "left" });

    await shapesBtn(page).click();
    await menuItem(page, "Rectangle").click();
    await drag(page, 700, 400, 850, 500);
    await page.keyboard.press("ControlOrMeta+a");
    await expect(bar(page)).toBeVisible();
    await expect(sizeBtn(page)).toHaveCount(0);
    await expect(boldBtn(page)).toHaveCount(0);
  });

  test("Size presets keep the top-left; auto-width text refits", async ({ page }) => {
    await openBoard(page);
    await placeText(page, 500, 300, "Hello there");
    const before = await text(page);

    await pickSize(page, "XL");
    const after = await text(page);
    expect(after).toMatchObject({ fontSize: 56, x: before.x, y: before.y, autoWidth: true });
    expect(after.width).toBeGreaterThan(before.width * 2);
    await expect(sizeBtn(page)).toHaveText("56");
    await sizeBtn(page).click();
    await expect(option(page, "Size XL")).toHaveAttribute("aria-pressed", "true");
    await option(page, "Size S").click();
    await page.waitForTimeout(150);
    expect(await text(page)).toMatchObject({ fontSize: 16 });
  });

  test("a fixed-width text keeps its width and rewraps", async ({ page }) => {
    await openBoard(page);
    await textBtn(page).click();
    await drag(page, 400, 300, 600, 300);
    await page.keyboard.type("A longer sentence that wraps inside a fixed width");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    const before = await text(page);
    expect(before.autoWidth).toBe(false);

    await pickSize(page, "L");
    const after = await text(page);
    expect(after).toMatchObject({ fontSize: 36, width: before.width, autoWidth: false });
    expect(after.height).toBeGreaterThan(before.height);
  });

  test("a corner drag shows the size it lands on, with no preset marked", async ({ page }) => {
    await openBoard(page);
    await placeText(page, 500, 300, "Hello there");
    const t = await textBox(page);
    await drag(page, t.x + t.w, t.y + t.h, t.x + t.w * 1.3, t.y + t.h * 1.3);
    await expect(bar(page)).toBeVisible();

    const size = Math.round((await text(page)).fontSize);
    expect(size).not.toBe(24);
    await expect(sizeBtn(page)).toHaveText(String(size));
    await sizeBtn(page).click();
    await expect(page.getByRole("group", { name: "Size options" }).locator("[aria-pressed=true]")).toHaveCount(0);
  });

  test("Bold and Italic toggle, alone and together", async ({ page }) => {
    await openBoard(page);
    await placeText(page, 500, 300, "Hello");

    await boldBtn(page).click();
    expect(await text(page)).toMatchObject({ fontStyle: "bold" });
    await expect(boldBtn(page)).toHaveAttribute("aria-pressed", "true");
    await italicBtn(page).click();
    expect(await text(page)).toMatchObject({ fontStyle: "italic bold" });
    await boldBtn(page).click();
    expect(await text(page)).toMatchObject({ fontStyle: "italic" });
    await italicBtn(page).click();
    expect(await text(page)).toMatchObject({ fontStyle: "normal" });
  });

  test("Align left, center and right", async ({ page }) => {
    await openBoard(page);
    await placeText(page, 500, 300, "Short", "A much longer line");

    await pickAlign(page, "Align center");
    expect(await text(page)).toMatchObject({ align: "center" });
    await pickAlign(page, "Align right");
    expect(await text(page)).toMatchObject({ align: "right" });
    await alignBtn(page).click();
    await expect(option(page, "Align right")).toHaveAttribute("aria-pressed", "true");
    await option(page, "Align left").click();
    await page.waitForTimeout(150);
    expect(await text(page)).toMatchObject({ align: "left" });
  });

  test("mixed texts: no size, nothing lit; a press applies to all as one undo step", async ({ page }) => {
    await openBoard(page);
    await placeText(page, 400, 250, "One");
    await boldBtn(page).click();
    await pickSize(page, "L");
    await placeText(page, 400, 450, "Two");
    await page.keyboard.press("ControlOrMeta+a");

    await expect(sizeBtn(page)).toHaveText("–");
    await expect(boldBtn(page)).toHaveAttribute("aria-pressed", "false");

    await boldBtn(page).click();
    expect((await texts(page)).map((t) => t.fontStyle)).toEqual(["bold", "bold"]);
    await pickSize(page, "XL");
    expect((await texts(page)).map((t) => t.fontSize)).toEqual([56, 56]);

    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(150);
    expect((await texts(page)).map((t) => t.fontSize)).toEqual([36, 24]);
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(150);
    expect((await texts(page)).map((t) => t.fontStyle)).toEqual(["bold", "normal"]);
  });

  test("undo puts back the format of text formatted for the first time; copy-paste keeps it", async ({ page }) => {
    await openBoard(page);
    await placeText(page, 500, 300, "Hello");
    const before = await text(page);
    await boldBtn(page).click();
    await pickAlign(page, "Align center");

    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    await page.waitForTimeout(200);
    const [a, b] = await texts(page);
    expect({ ...b, x: 0, y: 0 }).toEqual({ ...a, x: 0, y: 0 });

    await page.keyboard.press("ControlOrMeta+z");
    await page.keyboard.press("ControlOrMeta+z");
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(150);
    expect(await texts(page)).toEqual([before]);
  });

  test("the editor shows the text's size, weight, slant and alignment", async ({ page }) => {
    await openBoard(page);
    await placeText(page, 500, 300, "Hello", "there");
    await pickSize(page, "L");
    await boldBtn(page).click();
    await italicBtn(page).click();
    await pickAlign(page, "Align center");
    const before = await text(page);

    const t = await textBox(page);
    await page.mouse.dblclick(t.x + t.w / 2, t.y + t.h / 2);
    const editor = page.getByTestId("text-editor");
    await expect(editor).toBeVisible();
    await expect(editor).toHaveCSS("font-size", "36px");
    await expect(editor).toHaveCSS("font-weight", "700");
    await expect(editor).toHaveCSS("font-style", "italic");
    await expect(editor).toHaveCSS("text-align", "center");

    // Closing without a change leaves it exactly as it was.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    expect(await text(page)).toEqual(before);
  });
});

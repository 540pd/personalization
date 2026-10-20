import { test, expect, type Page } from "@playwright/test";
import { openBoard, uploadImage } from "./helpers";

// #235: items with a name get a 24 band above them in an auto layout Frame,
// so their names sit inside it, clear of its edge and of the item above.

/* eslint-disable @typescript-eslint/no-explicit-any */

type Box = { x: number; y: number; width: number; height: number };

const NAMES = ["sunset beach", "city night", "forest trail"];

async function drag(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 });
  await page.mouse.move(x2, y2, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

const frameBox = (page: Page): Promise<Box> =>
  page.evaluate(() => {
    const stages = (window as any).Konva.stages as any[];
    const fs = stages.find((st) => st.find(".frame").length);
    const r = fs.find(".frame")[0].getClientRect({ skipStroke: true });
    const c = fs.container().getBoundingClientRect();
    return { x: c.left + r.x, y: c.top + r.y, width: r.width, height: r.height };
  });

/** Every image on the board, on screen. */
const imageBoxes = (page: Page): Promise<Box[]> =>
  page.evaluate(() => {
    const stage = (window as any).Konva.stages[0];
    const c = stage.container().getBoundingClientRect();
    return stage.find("Image").map((n: any) => {
      const r = n.getClientRect({ skipStroke: true });
      return { x: c.left + r.x, y: c.top + r.y, width: r.width, height: r.height };
    });
  });

const nameBox = async (page: Page, name: string) => (await page.locator(`div[title="${name}"]`).boundingBox())!;
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function selectFrame(page: Page) {
  const f = await frameBox(page);
  await page.mouse.click(f.x + 6, f.y + f.height - 6);
  await page.waitForTimeout(150);
}

/** Three named images in a Frame with auto layout, then nothing selected. */
async function setUp(page: Page) {
  await openBoard(page);
  for (const n of NAMES) await uploadImage(page, 200, 140, `${n}.png`);
  await page.locator(".floating-dock button[aria-pressed]").nth(3).click();
  await drag(page, 260, 60, 1200, 660);
  await selectFrame(page);
  await page.getByRole("button", { name: "Auto layout", exact: true }).click();
  await page.waitForTimeout(400);
  await page.mouse.click(1250, 690);
  await page.waitForTimeout(200);
}

/** No name crosses the Frame's edge or lies on an image. */
async function expectNamesClear(page: Page) {
  const f = await frameBox(page);
  const images = await imageBoxes(page);
  for (const n of NAMES) {
    const b = await nameBox(page, n);
    expect(b.y, `${n} below the Frame's edge`).toBeGreaterThan(f.y);
    for (const img of images) expect(overlaps(b, img), `${n} clear of every image`).toBe(false);
  }
}

test.describe("auto layout: room for names (#235)", () => {
  test("in a row, every name sits inside the Frame, 8 below its edge", async ({ page }) => {
    await setUp(page);
    const f = await frameBox(page);
    const top = Math.min(...(await imageBoxes(page)).map((b) => b.y));
    expect(Math.round(top - f.y)).toBe(8 + 24);
    await expectNamesClear(page);
  });

  test("resized to a column, each name is clear of the image above", async ({ page }) => {
    await setUp(page);
    await selectFrame(page);
    const f = await frameBox(page);
    await drag(page, f.x + f.width, f.y + f.height, f.x + 240, f.y + 640);
    await page.mouse.click(1250, 690);
    await page.waitForTimeout(200);
    const images = (await imageBoxes(page)).sort((a, b) => a.y - b.y);
    expect(new Set(images.map((b) => Math.round(b.x))).size).toBe(1);
    for (let i = 1; i < images.length; i++) {
      expect(Math.round(images[i].y - (images[i - 1].y + images[i - 1].height))).toBe(16 + 24);
    }
    await expectNamesClear(page);
  });

  test("with names off in Settings, the spacing is the same", async ({ page }) => {
    await setUp(page);
    const before = await imageBoxes(page);
    await page.locator(".sidebar-identity").click();
    await page.getByRole("menuitem", { name: /Settings/ }).click();
    await page.getByRole("switch").click();
    await page.locator(".sidebar-item", { hasText: "Playspace" }).click();
    await page.waitForTimeout(300);
    expect(await imageBoxes(page)).toEqual(before);
  });
});

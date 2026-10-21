import { test, expect, type Page } from "@playwright/test";
import { openBoard, uploadImage, collapsePanels, setZoom } from "./helpers";

// Issue #163. The style bar on Frames: Color only, and it is the outline.

/* eslint-disable @typescript-eslint/no-explicit-any */

const frameBtn = (page: Page) => page.getByRole("button", { name: "Frame", exact: true });
const shapesBtn = (page: Page) => page.getByRole("button", { name: "Shapes", exact: true });
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

async function drag(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 });
  await page.mouse.move(x2, y2, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

/** Draws a Frame; it is left selected. */
async function drawFrame(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await frameBtn(page).click();
  await drag(page, x1, y1, x2, y2);
}

async function pickColor(page: Page, name: string) {
  await colorBtn(page).click();
  await colors(page).getByRole("button", { name, exact: true }).click();
  await page.waitForTimeout(150);
}

/** Every Frame's outline and fill. */
const frameLooks = (page: Page): Promise<{ stroke: string; fill: string }[]> =>
  page.evaluate(() => {
    const stages = (window as any).Konva.stages as any[];
    const fs = stages.find((st) => st.find(".frame").length);
    return fs ? fs.find(".frame").map((r: any) => ({ stroke: r.stroke(), fill: r.fill() })) : [];
  });

/** The name label of a Frame, by its text. */
const frameName = (page: Page, name: string) => page.locator(`div[title="${name}"]`);

test.describe("the style bar on Frames", () => {
  test("shows Color only, centred above the Frame, clear of its name", async ({ page }) => {
    await openBoard(page);
    await drawFrame(page, 350, 250, 750, 500);

    await expect(bar(page)).toBeVisible();
    await expect(colorBtn(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Shape fill" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Shape stroke" })).toHaveCount(0);

    // Wide: the name is nowhere near the centred bar, so the bar sits as
    // close as it does over a shape (#223).
    const box = (await bar(page).boundingBox())!;
    const name = (await frameName(page, "Frame").boundingBox())!;
    expect(Math.round(250 - (box.y + box.height))).toBe(14);
    expect(box.x).toBeGreaterThan(name.x + name.width);
    expect(Math.abs(box.x + box.width / 2 - 550)).toBeLessThan(3);
  });

  test("never covers the name of a narrow Frame", async ({ page }) => {
    await openBoard(page);
    await drawFrame(page, 500, 300, 610, 420);
    const box = (await bar(page).boundingBox())!;
    const name = (await frameName(page, "Frame").boundingBox())!;
    const overlaps =
      box.x < name.x + name.width && name.x < box.x + box.width &&
      box.y < name.y + name.height && name.y < box.y + box.height;
    expect(overlaps).toBe(false);
  });

  test("Color changes the outline only, and the dot and card follow", async ({ page }) => {
    await openBoard(page);
    await drawFrame(page, 350, 250, 750, 500);
    const [before] = await frameLooks(page);

    await pickColor(page, "Coral");
    const [after] = await frameLooks(page);
    expect(after).toEqual({ stroke: CORAL, fill: before.fill });

    await colorBtn(page).click();
    await expect(colors(page).getByRole("button", { name: "Coral", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");

    // As the dock's Color: it is also the colour for the next item.
    await dockColor(page).click();
    await expect(page.getByRole("group", { name: "Colors" }).getByRole("button", { name: "Coral", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
  });

  test("flips below a Frame at the top of the screen", async ({ page }) => {
    await openBoard(page);
    await drawFrame(page, 350, 60, 750, 300);
    await expect(bar(page)).toHaveAttribute("data-placement", "below");
    expect((await bar(page).boundingBox())!.y).toBeGreaterThan(300);
  });

  test("hides while the Frame is dragged, dragged by its name, or resized", async ({ page }) => {
    await openBoard(page);
    await drawFrame(page, 350, 250, 750, 500);

    // By its body.
    await page.mouse.move(550, 380);
    await page.mouse.down();
    await page.mouse.move(580, 400, { steps: 4 });
    await expect(bar(page)).toHaveCount(0);
    await page.mouse.up();
    await page.waitForTimeout(200);
    await expect(bar(page)).toBeVisible();

    // By its name.
    const name = (await frameName(page, "Frame").boundingBox())!;
    await page.mouse.move(name.x + 10, name.y + name.height / 2);
    await page.mouse.down();
    await page.mouse.move(name.x + 40, name.y + name.height / 2 + 20, { steps: 4 });
    await expect(bar(page)).toHaveCount(0);
    await page.mouse.up();
    await page.waitForTimeout(200);
    await expect(bar(page)).toBeVisible();

    // From its bottom-right corner, wherever the two moves left it.
    const corner = await page.evaluate(() => {
      const stages = (window as any).Konva.stages as any[];
      const fs = stages.find((st) => st.find(".frame").length);
      const r = fs.find(".frame")[0].getClientRect();
      const c = fs.container().getBoundingClientRect();
      return { x: c.left + r.x + r.width, y: c.top + r.y + r.height };
    });
    await page.mouse.move(corner.x, corner.y);
    await page.mouse.down();
    await page.mouse.move(corner.x + 40, corner.y + 30, { steps: 4 });
    await expect(bar(page)).toHaveCount(0);
    await page.mouse.up();
    await page.waitForTimeout(200);
    await expect(bar(page)).toBeVisible();
  });

  test("with shapes and lines selected too: Color only, one undo step for all", async ({ page }) => {
    await openBoard(page);
    await drawFrame(page, 300, 200, 500, 350);
    await shapesBtn(page).click();
    await menuItem(page, "Rectangle").click();
    await drag(page, 650, 220, 800, 320);
    await shapesBtn(page).click();
    await menuItem(page, "Line").click();
    await drag(page, 650, 420, 850, 420);

    await page.keyboard.press("ControlOrMeta+a");
    await expect(bar(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Shape fill" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Shape stroke" })).toHaveCount(0);

    await pickColor(page, "Blue");
    const shapes = () =>
      page.evaluate(() =>
        (window as any).Konva.stages[0].find(".selectable")
          .filter((n: any) => n.getClassName() === "BoardShape")
          .map((n: any) => n.getAttr("swatch") || null));
    expect((await frameLooks(page))[0].stroke).toBe(BLUE);
    expect(await shapes()).toEqual([BLUE, BLUE]);

    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(150);
    expect((await frameLooks(page))[0].stroke).not.toBe(BLUE);
    expect(await shapes()).toEqual([null, null]);
  });

  test("two Frames of different colours show the mixed dot, nothing marked", async ({ page }) => {
    await openBoard(page);
    await drawFrame(page, 300, 250, 500, 400);
    await pickColor(page, "Coral");
    await drawFrame(page, 650, 250, 850, 400);
    await page.keyboard.press("ControlOrMeta+a");
    await colorBtn(page).click();
    await expect(colors(page).locator("[aria-pressed=true]")).toHaveCount(0);
  });

  test("no bar with an image in the selection", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 200, 150);
    await collapsePanels(page);
    await drawFrame(page, 850, 400, 1050, 550);
    await expect(bar(page)).toBeVisible();
    await page.keyboard.press("ControlOrMeta+a");
    await expect(bar(page)).toHaveCount(0);
  });

  test("keeps its size at 50% and 150% zoom", async ({ page }) => {
    await openBoard(page);
    await drawFrame(page, 450, 300, 750, 450);
    const at100 = (await bar(page).boundingBox())!;
    for (const z of [0.5, 1.5]) {
      await setZoom(page, z);
      const box = (await bar(page).boundingBox())!;
      expect(box.height).toBeCloseTo(at100.height, 0);
      expect(box.width).toBeCloseTo(at100.width, 0);
    }
  });
});
